import type { GameStateModifier, UserInventoryPeekItem } from "@repo/types"
import { hasInventoryPeek } from "./inventoryPeekFlag"

export type PeekPolicyInventoryItem = {
  itemId: string
  definitionId: string
}

export type PeekPolicyItemDefinition = {
  id: string
  requiresTarget?: string | null
}

/**
 * Pure (no I/O) policy predicate for PEEK_USER_INVENTORY (ADR 0147).
 *
 * Callers supply the already-fetched data; the function returns the same
 * discriminated union as {@link canPeekUserInventory} so both the real
 * server path and the Game Studio bridge share identical logic.
 *
 * Authorization is an OR of:
 *  - trading mode (`allowTrading === true`)
 *  - timed `inventory_peek` flag on the actor (ADR 0149)
 *  - item use (`itemId` owned, definition has `requiresTarget: "userInventoryItem"`)
 */
/**
 * Identity preconditions shared by every peek path. Callers that do I/O run
 * this first so a self-peek is rejected before any lookup; `evaluatePeekPolicy`
 * applies it too, so the rule has exactly one owner.
 */
export function checkPeekIdentity(
  actorUserId: string,
  targetUserId: string,
): { ok: true } | { ok: false; message: string } {
  if (!targetUserId) return { ok: false, message: "Missing targetUserId" }
  if (actorUserId === targetUserId) {
    return { ok: false, message: "Cannot peek your own inventory" }
  }
  return { ok: true }
}

export function evaluatePeekPolicy(params: {
  actorUserId: string
  targetUserId: string
  allowTrading: boolean
  actorModifiers: GameStateModifier[] | undefined
  itemId: string | undefined
  actorInventory: PeekPolicyInventoryItem[]
  itemDefinitions: PeekPolicyItemDefinition[]
  now?: number
}):
  | { ok: true; reason: "allow_trading" | "inventory_peek" | "item_use" }
  | { ok: false; message: string } {
  const {
    actorUserId,
    targetUserId,
    allowTrading,
    actorModifiers,
    itemId,
    actorInventory,
    itemDefinitions,
    now = Date.now(),
  } = params

  const identity = checkPeekIdentity(actorUserId, targetUserId)
  if (!identity.ok) return identity

  if (allowTrading) return { ok: true, reason: "allow_trading" }

  if (hasInventoryPeek(actorModifiers, now)) return { ok: true, reason: "inventory_peek" }

  if (!itemId) return { ok: false, message: "Inventory peek is not allowed" }

  const owned = actorInventory.find((i) => i.itemId === itemId)
  if (!owned) return { ok: false, message: "Item not found in inventory" }

  const def = itemDefinitions.find((d) => d.id === owned.definitionId)
  if (def?.requiresTarget !== "userInventoryItem") {
    return { ok: false, message: "Inventory peek is not allowed" }
  }

  return { ok: true, reason: "item_use" }
}

export type PeekHydrationStack = PeekPolicyInventoryItem & { quantity: number }

export type PeekHydrationDefinition = {
  id: string
  name: string
  shortId: string
  icon?: string
  imageUrl?: string | null
  artworkFrame?: UserInventoryPeekItem["artworkFrame"] | null
  rarity?: UserInventoryPeekItem["rarity"]
  tradeable: boolean
  slotPool?: string | null
}

/**
 * Hydrate peek stacks into the `USER_INVENTORY_PEEK_RESULT` payload (ADR 0147).
 *
 * Pure and shared so the production server and the Game Studio bridge emit an
 * identical shape — a field added here reaches both. Stacks whose definition is
 * missing from the catalog are dropped. Never include stack `metadata`.
 */
export function hydratePeekItems(
  stacks: PeekHydrationStack[],
  definitions: PeekHydrationDefinition[],
): UserInventoryPeekItem[] {
  const byId = new Map(definitions.map((d) => [d.id, d]))
  const items: UserInventoryPeekItem[] = []
  for (const stack of stacks) {
    const def = byId.get(stack.definitionId)
    if (!def) continue
    items.push({
      itemId: stack.itemId,
      definitionId: stack.definitionId,
      quantity: stack.quantity,
      name: def.name,
      shortId: def.shortId,
      icon: def.icon,
      ...(def.imageUrl != null ? { imageUrl: def.imageUrl } : {}),
      ...(def.artworkFrame != null ? { artworkFrame: def.artworkFrame } : {}),
      rarity: def.rarity,
      tradeable: def.tradeable,
      slotPool: def.slotPool === "collection" ? "collection" : "inventory",
    })
  }
  return items
}
