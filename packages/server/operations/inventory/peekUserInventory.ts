import { checkPeekIdentity, evaluatePeekPolicy, hydratePeekItems } from "@repo/game-logic"
import type { AppContext, UserInventoryPeekResult } from "@repo/types"

export type CanPeekUserInventoryParams = {
  roomId: string
  actorUserId: string
  targetUserId: string
  /** Required when trading is off and authorization is via item use. */
  itemId?: string
  context: AppContext
}

export type CanPeekUserInventoryResult =
  | { ok: true; reason: "item_use" | "allow_trading" | "inventory_peek" }
  | { ok: false; message: string }

/**
 * Whether `actorUserId` may peek `targetUserId`'s inventory (ADR 0147 / 0149).
 *
 * This wrapper owns only I/O and the server-only preconditions (active session,
 * target present in the room, services wired). The authorization rules live in
 * `evaluatePeekPolicy` (`@repo/game-logic`) and are evaluated exactly once, so
 * the studio-bridge shares identical rules without server dependencies.
 */
export async function canPeekUserInventory(
  params: CanPeekUserInventoryParams,
): Promise<CanPeekUserInventoryResult> {
  const { roomId, actorUserId, targetUserId, itemId, context } = params

  // Cheap identity rules first, so a self-peek never costs a lookup.
  const identity = checkPeekIdentity(actorUserId, targetUserId)
  if (!identity.ok) return identity

  const gameSessions = context.gameSessions
  if (!gameSessions) {
    return { ok: false, message: "Game sessions not available" }
  }
  const session = await gameSessions.getActiveSession(roomId)
  if (!session) {
    return { ok: false, message: "No active game session" }
  }

  const online = await context.redis.pubClient.sIsMember(
    `room:${roomId}:online_users`,
    targetUserId,
  )
  if (!online) {
    return { ok: false, message: "That user is not in this room" }
  }

  const now = Date.now()
  const allowTrading = session.config.allowTrading === true

  // Trading mode authorizes on its own; skip the actor reads entirely.
  if (allowTrading) {
    return evaluatePeekPolicy({
      actorUserId,
      targetUserId,
      allowTrading: true,
      actorModifiers: undefined,
      itemId,
      actorInventory: [],
      itemDefinitions: [],
      now,
    })
  }

  // Reuse the session resolved above — `getUserState` would otherwise re-read
  // the active-session pointer and blob for this same check.
  const actorState = await gameSessions.getUserState(roomId, actorUserId, session)

  // The `inventory_peek` flag also authorizes on its own — only the item-use
  // branch needs the actor's inventory and the definitions behind it.
  const needsItemUseData = itemId != null
  const inventory = context.inventory
  if (needsItemUseData && !inventory) {
    return { ok: false, message: "Inventory service not available" }
  }

  const actorInv =
    needsItemUseData && inventory ? await inventory.getInventory(roomId, actorUserId) : null
  const defs =
    actorInv && inventory
      ? await inventory.getItemDefinitions(
          roomId,
          Array.from(new Set(actorInv.items.map((i) => i.definitionId))),
        )
      : []

  return evaluatePeekPolicy({
    actorUserId,
    targetUserId,
    allowTrading: false,
    actorModifiers: actorState?.modifiers,
    itemId,
    actorInventory: actorInv?.items ?? [],
    itemDefinitions: defs,
    now,
  })
}

/**
 * Peek another user's inventory when policy allows (ADR 0147).
 * Returns both slot pools with hydrated public catalog fields (no metadata).
 */
export async function peekUserInventory(params: {
  roomId: string
  actorUserId: string
  targetUserId?: string
  itemId?: string
  context: AppContext
}): Promise<UserInventoryPeekResult> {
  const { roomId, actorUserId, context } = params
  const targetUserId = params.targetUserId?.trim()
  if (!targetUserId) {
    return { success: false, message: "Missing targetUserId" }
  }

  const auth = await canPeekUserInventory({
    roomId,
    actorUserId,
    targetUserId,
    itemId: params.itemId,
    context,
  })
  if (!auth.ok) {
    return { success: false, message: auth.message }
  }

  const inventory = context.inventory
  if (!inventory) {
    return { success: false, message: "Inventory service not available" }
  }

  const inv = await inventory.getInventory(roomId, targetUserId)
  const defIds = [...new Set(inv.items.map((i) => i.definitionId))]
  const defs = await inventory.getItemDefinitions(roomId, defIds)

  return { success: true, targetUserId, items: hydratePeekItems(inv.items, defs) }
}
