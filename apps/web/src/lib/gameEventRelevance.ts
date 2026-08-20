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
