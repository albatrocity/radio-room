import type { TradeSession } from "@repo/types"

/**
 * Game session, modifier, and inventory events are broadcast to the whole room
 * (RoomBroadcaster fans every system event to the room channel), but each one
 * names the user it concerns. Clients use this to skip refetching their own
 * private state when the event belongs to someone else.
 *
 * `INVENTORY_ITEM_TRANSFERRED` names two users instead of one; both sides' state
 * changed, so both treat it as theirs.
 *
 * Fails open: an event with no user on it, or a client that has not learned its
 * own user id yet, counts as relevant rather than being silently dropped.
 */
export type UserScopedEventData = {
  userId?: string
  fromUserId?: string
  toUserId?: string
}

type NestedParty = {
  fromUserId?: string
  toUserId?: string
  participants?: Record<string, unknown>
}

export type GiftTradeEventData = UserScopedEventData & {
  offer?: NestedParty
  invite?: NestedParty
  trade?: NestedParty
}

export function isGameEventForUser(
  data: UserScopedEventData | undefined,
  currentUserId: string | undefined,
): boolean {
  if (!currentUserId || !data) return true
  if (data.fromUserId != null || data.toUserId != null) {
    return data.fromUserId === currentUserId || data.toUserId === currentUserId
  }
  if (data.userId == null) return true
  return data.userId === currentUserId
}

/** Gift/trade payloads nest the parties on `offer`, `invite`, or `trade`. */
export function isGiftTradeEventForUser(
  data: GiftTradeEventData | undefined,
  currentUserId: string | undefined,
): boolean {
  if (!currentUserId || !data) return true
  const nested = data.offer ?? data.invite ?? data.trade
  const from = data.fromUserId ?? nested?.fromUserId
  const to = data.toUserId ?? nested?.toUserId
  if (from != null || to != null) {
    return from === currentUserId || to === currentUserId
  }
  if (nested?.participants && currentUserId in nested.participants) return true
  if (nested) return false
  return isGameEventForUser(data, currentUserId)
}

/** Lock/unlock moves items into or out of escrow — inventory must refetch. */
export function tradeEscrowChanged(
  prev: TradeSession | null | undefined,
  next: TradeSession,
): boolean {
  const ids = new Set([
    ...Object.keys(prev?.participants ?? {}),
    ...Object.keys(next.participants),
  ])
  for (const id of ids) {
    const a = prev?.participants[id]
    const b = next.participants[id]
    if (!!a?.locked !== !!b?.locked) return true
    if ((a?.offer?.length ?? 0) !== (b?.offer?.length ?? 0)) return true
  }
  return false
}
