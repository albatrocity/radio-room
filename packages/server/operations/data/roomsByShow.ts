import type { AppContext } from "@repo/types"
import type { Room } from "@repo/types/Room"
import { findRoom } from "./rooms"

/** Rooms whose `showId` is in `showIds`, from a single pass over the `rooms` set. */
export async function findRoomsByShowIds(
  context: AppContext,
  showIds: ReadonlySet<string>,
): Promise<Array<{ roomId: string; room: Room }>> {
  if (showIds.size === 0) return []
  const roomIds = await context.redis.pubClient.sMembers("rooms")
  const matches: Array<{ roomId: string; room: Room }> = []
  for (const roomId of roomIds) {
    const room = await findRoom({ context, roomId })
    if (room?.showId && showIds.has(room.showId)) {
      matches.push({ roomId, room })
    }
  }
  return matches
}

export async function findRoomIdsByShowId(context: AppContext, showId: string): Promise<string[]> {
  const matches = await findRoomsByShowIds(context, new Set([showId]))
  return matches.map((match) => match.roomId)
}
