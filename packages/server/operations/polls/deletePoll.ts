import type { AppContext } from "@repo/types"
import { findRoom, isRoomAdmin } from "../data"
import {
  deletePollKeys,
  getActivePollId,
  getPoll,
  removePollFromIndex,
} from "../data/polls"
import type { PollOperationFailure } from "./types"

export type DeletePollResult =
  | { ok: true; pollId: string }
  | PollOperationFailure
  | { ok: false; error: { status: 400; error: string; message: string } }

export async function deletePoll({
  context,
  roomId,
  userId,
  pollId,
}: {
  context: AppContext
  roomId: string
  userId: string
  pollId: string
}): Promise<DeletePollResult> {
  const room = await findRoom({ context, roomId })
  if (!room) {
    return { ok: false, error: { status: 404, error: "Not Found", message: "Room not found." } }
  }

  const isAdmin = await isRoomAdmin({ context, roomId, userId, roomCreator: room.creator })
  if (!isAdmin) {
    return {
      ok: false,
      error: { status: 403, error: "Forbidden", message: "You are not a room admin." },
    }
  }

  const poll = await getPoll({ context, roomId, pollId })
  if (!poll) {
    return { ok: false, error: { status: 404, error: "Not Found", message: "Poll not found." } }
  }

  const activePollId = await getActivePollId({ context, roomId })
  if (activePollId === pollId) {
    return {
      ok: false,
      error: {
        status: 400,
        error: "Bad Request",
        message: "Close the active poll before deleting it.",
      },
    }
  }

  await removePollFromIndex({ context, roomId, pollId })
  await deletePollKeys({ context, roomId, pollId })

  if (context.systemEvents) {
    await context.systemEvents.emit(roomId, "POLL_DELETED", { roomId, pollId })
  }

  return { ok: true, pollId }
}
