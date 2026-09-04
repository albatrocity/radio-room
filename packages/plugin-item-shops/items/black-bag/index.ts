import type { InventoryItem, ItemDefinition, ItemUseResult } from "@repo/types"
import { resolveSlotPool, SLOT_POOL_LABELS } from "@repo/types"
import {
  sendAttributedSystemMessage,
  resolveItemUseActorDisplayName,
} from "../shared/resolveItemUseActorDisplayName"
import { createItem, type ItemShopsBehaviorDeps } from "../shared/types"

/** Probe flag so Warranty (`intents: ["negative"]`) still matches — never applied. */
const BURGLE_PROBE_FLAG = "burgled"

type PluginInventory = ItemShopsBehaviorDeps["context"]["inventory"]

async function fetchDefinitions(
  inventory: PluginInventory,
  ids: readonly string[],
): Promise<ItemDefinition[]> {
  if (ids.length === 0) return []
  if (typeof inventory.getItemDefinitions === "function") {
    return inventory.getItemDefinitions(ids)
  }
  const rows = await Promise.all(ids.map((id) => inventory.getItemDefinition(id)))
  return rows.filter((d): d is ItemDefinition => d != null)
}

/** Resolve catalog defs for victim stacks in one (or two) batched reads. */
async function definitionsByLookupId(
  inventory: PluginInventory,
  pluginName: string,
  definitionIds: readonly string[],
): Promise<Map<string, ItemDefinition>> {
  const unique = [...new Set(definitionIds.filter(Boolean))]
  const byId = new Map<string, ItemDefinition>()
  const first = await fetchDefinitions(inventory, unique)
  for (const def of first) byId.set(def.id, def)

  const missing = unique.filter((id) => !byId.has(id))
  const prefixed = missing.filter((id) => !id.includes(":")).map((id) => `${pluginName}:${id}`)
  if (prefixed.length > 0) {
    const extra = await fetchDefinitions(inventory, prefixed)
    for (const def of extra) byId.set(def.id, def)
  }

  const byLookup = new Map<string, ItemDefinition>()
  for (const id of unique) {
    const def = byId.get(id) ?? byId.get(`${pluginName}:${id}`)
    if (def) byLookup.set(id, def)
  }
  return byLookup
}

async function useBlackBag(
  deps: ItemShopsBehaviorDeps,
  userId: string,
  definition: ItemDefinition,
  callContext?: unknown,
): Promise<ItemUseResult> {
  const { context, game, pluginName } = deps
  const ctx = callContext as { targetUserId?: string; targetInventoryItemId?: string } | undefined
  const targetUserId = ctx?.targetUserId?.trim()
  const targetInventoryItemId = ctx?.targetInventoryItemId?.trim()

  if (!targetUserId) {
    return { success: false, consumed: false, message: "Select a user to burgle." }
  }
  if (targetUserId === userId) {
    return { success: false, consumed: false, message: "You can't burgle yourself." }
  }

  if (!(await context.api.isUserInRoom(context.roomId, targetUserId))) {
    return { success: false, consumed: false, message: "That user is not in this room." }
  }

  const victimInv = await context.inventory.getInventory(targetUserId)
  const byDef = await definitionsByLookupId(
    context.inventory,
    pluginName,
    victimInv.items.map((s) => s.definitionId),
  )
  const stealable: { stack: InventoryItem; def: ItemDefinition }[] = []
  for (const stack of victimInv.items) {
    const def = byDef.get(stack.definitionId)
    if (!def) continue
    if (stack.quantity <= 0) continue
    stealable.push({ stack, def })
  }

  if (stealable.length === 0) {
    return { success: false, consumed: false, message: "They have nothing to steal." }
  }

  let pick: { stack: InventoryItem; def: ItemDefinition } | undefined
  if (targetInventoryItemId) {
    pick = stealable.find((s) => s.stack.itemId === targetInventoryItemId)
    if (!pick) {
      return {
        success: false,
        consumed: false,
        message: "That item is not in their inventory (or is not stealable).",
      }
    }
  } else {
    pick = stealable[Math.floor(Math.random() * stealable.length)]
  }
  if (!pick) {
    return { success: false, consumed: false, message: "They have nothing to steal." }
  }

  // Transactional steal: defense check only — no lasting modifier (ADR 0148).
  // omitBlockedModifier so Rubber Band blocks without rebound.
  const now = Date.now()
  const defense = await game.checkModifierDefense(
    targetUserId,
    {
      name: "black-bag",
      effects: [
        {
          type: "flag",
          name: BURGLE_PROBE_FLAG,
          value: true,
          intent: "negative",
          icon: definition.icon as never,
        },
      ],
      stackBehavior: "stack",
      itemDefinitionId: definition.id,
      startAt: now,
      endAt: now,
    },
    userId,
    { omitBlockedModifier: true },
  )

  if (!defense.ok) {
    if (defense.reason === "defense_blocked") {
      return {
        success: false,
        consumed: true,
        title: "Intercepted",
        message:
          defense.attackerMessage ??
          `Blocked by ${defense.blockingItemName}. Your item was lost with use.`,
      }
    }
    return { success: false, consumed: false, message: "Could not apply effect." }
  }

  const removed = await context.inventory.removeItem(targetUserId, pick.stack.itemId, 1)
  if (!removed) {
    return {
      success: false,
      consumed: false,
      message: "Could not take that item (it may have moved).",
    }
  }

  const granted = await context.inventory.giveItem(
    userId,
    pick.stack.definitionId,
    1,
    pick.stack.metadata,
    "plugin",
  )
  if (!granted) {
    await context.inventory.giveItem(
      targetUserId,
      pick.stack.definitionId,
      1,
      pick.stack.metadata,
      "plugin",
    )
    const poolFull = `Your ${SLOT_POOL_LABELS[resolveSlotPool(pick.def)].toLowerCase()} is full — nothing was stolen.`
    return {
      success: false,
      consumed: false,
      message: poolFull,
    }
  }

  const [actorName, targetName] = await Promise.all([
    resolveItemUseActorDisplayName(deps, userId),
    resolveItemUseActorDisplayName(deps, targetUserId),
  ])
  const label = pick.def.name
  await sendAttributedSystemMessage(
    deps,
    `${actorName.label} used a Black Bag and stole ${label} from ${targetName.label}!`,
    actorName,
    targetName,
  )
  await context.api.sendUserToast(context.roomId, targetUserId, {
    title: "Item stolen",
    description: `${actorName.label} stole your ${label} with a Black Bag.`,
    type: "error",
    source: "item-shops",
    id: `black-bag-stolen-${pick.stack.itemId}-${now}`,
  })

  return {
    success: true,
    consumed: true,
    message: `Stolen ${label}.`,
  }
}

export const blackBag = createItem({
  shortId: "black-bag",
  definition: {
    name: "Black Bag",
    description: "Steal an item from somebody else's inventory.",
    stackable: false,
    maxStack: 1,
    tradeable: true,
    consumable: true,
    requiresTarget: "userInventoryItem",
    coinValue: 80,
    icon: "PaperBag",
    rarity: "legendary",
  },
  use: useBlackBag,
})
