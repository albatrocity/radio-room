import type { Request } from "express"
import type { AppContext } from "@repo/types"
import { RADIO_SESSION_HEADER } from "./constants"
import { getUser, getRoomUsers } from "../operations/data"

/**
 * Resolve the room member making an authenticated REST request.
 *
 * Socket login often does not persist the Express session cookie, so HTTP
 * requests may lack `req.session.user`. Accept the same header as scheduling
 * guest reads: Redis user id + verify the user is online in the room.
 */
export async function resolveRoomMemberUserId(
  req: Request,
  context: AppContext,
  roomId: string,
): Promise<string | null> {
  const fromSession = req.session.user?.userId
  if (fromSession) {
    return fromSession
  }

  const fromHeader = req.get(RADIO_SESSION_HEADER)?.trim()
  if (!fromHeader) {
    return null
  }

  const user = await getUser({ context, userId: fromHeader })
  if (!user) {
    return null
  }

  const roomUsers = await getRoomUsers({ context, roomId })
  if (!roomUsers.some((u) => u.userId === fromHeader)) {
    return null
  }

  return fromHeader
}
