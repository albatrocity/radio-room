import type { AppContext } from "@repo/types"
import type { DeputyBulkAction } from "@repo/types"
import { addDj, getDjs, removeDj } from "../data/djs"
import { getRoomUsers } from "../data/users"
import { writeJsonToHset } from "../data/utils"

/**
 * Apply bulk deputy-DJ changes when a segment is activated.
 * - `dedeputize_all`: remove everyone from `room:{id}:djs` and clear `isDeputyDj` on stored users.
 * - `deputize_all`: add all currently online users to `room:{id}:djs` and set `isDeputyDj` on their user records.
 */
export async function applySegmentDeputyBulkAction(params: {
  context: AppContext
  roomId: string
  action: DeputyBulkAction | undefined
}): Promise<void> {
  const { context, roomId, action } = params
  if (action !== "deputize_all" && action !== "dedeputize_all") return

  if (action === "dedeputize_all") {
    const djIds = await getDjs({ context, roomId })
    for (const userId of djIds) {
      await removeDj({ context, roomId, userId })
      await writeJsonToHset({
        context,
        setKey: `user:${userId}`,
        attributes: { isDeputyDj: false },
      })
    }
  } else {
    const users = await getRoomUsers({ context, roomId })
    for (const u of users) {
      const userId = u.userId
      await addDj({ context, roomId, userId })
      await writeJsonToHset({
        context,
        setKey: `user:${userId}`,
        attributes: { isDeputyDj: true },
      })
    }
  }

  const users = await getRoomUsers({ context, roomId })
  if (users.length > 0 && context.systemEvents) {
    await context.systemEvents.emit(roomId, "USER_JOINED", {
      roomId,
      user: users[0],
      users,
    })
  }
}
