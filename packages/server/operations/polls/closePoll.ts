import type { AppContext, Poll, PollCloseReason } from "@repo/types"
import { findRoom, isRoomAdmin } from "../data"
import {
  cancelAutoClose,
  clearActivePollId,
  getPollRecord,
  getPollVotes,
  reduceVotesToResults,
  writePoll,
  writeResultsSnapshot,
} from "../data/polls"
import { formatPollResultsForChat } from "./formatResults"
import { postSystemChatMessage } from "./postSystemChatMessage"
import type { PollOperationFailure } from "./types"

export type ClosePollResult =
  | { ok: true; poll: Poll; results: ReturnType<typeof reduceVotesToResults> }
  | PollOperationFailure
  | { ok: false; error: { status: 400; error: string; message: string } }

export async function closePoll({
  context,
  roomId,
  userId,
  pollId,
  source,
  announce = true,
  reason = "manual",
}: {
  context: AppContext
  roomId: string
  userId: string
  pollId: string
  /**
   * When set, skip the room-admin gate (ADR 0152 / ADR 0189).
   * Socket/admin callers omit this.
   */
  source?: { pluginName: string } | { system: "autoClose" }
  /** When false, skip close/results chat. Defaults to true. */
  announce?: boolean
  /** How the poll was closed (ADR 0189). */
  reason?: PollCloseReason
}): Promise<ClosePollResult> {
  const room = await findRoom({ context, roomId })
  if (!room) {
    return { ok: false, error: { status: 404, error: "Not Found", message: "Room not found." } }
  }

  const isSystem = source && "system" in source && source.system === "autoClose"
  const isPlugin = source && "pluginName" in source && !!source.pluginName

  if (!isSystem && !isPlugin) {
    const isAdmin = await isRoomAdmin({ context, roomId, userId, roomCreator: room.creator })
    if (!isAdmin) {
      return {
        ok: false,
        error: { status: 403, error: "Forbidden", message: "You are not a room admin." },
      }
    }
  }

  const record = await getPollRecord({ context, roomId, pollId })
  if (!record) {
    return { ok: false, error: { status: 404, error: "Not Found", message: "Poll not found." } }
  }

  const { announceClose, ...poll } = record

  if (poll.status !== "open") {
    return {
      ok: false,
      error: { status: 400, error: "Bad Request", message: "This poll is not open." },
    }
  }

  const closedAt = Date.now()
  const votes = await getPollVotes({ context, roomId, pollId })
  const results = reduceVotesToResults({
    pollId,
    options: poll.options,
    votes,
    closedAt,
  })

  const closedPoll: Poll = { ...poll, status: "closed", closedAt }

  try {
    await writeResultsSnapshot({ context, roomId, pollId, results })
    await writePoll({ context, poll: closedPoll, announceClose })
    await clearActivePollId({ context, roomId })
    await cancelAutoClose({ context, roomId, pollId })
  } catch (err) {
    console.error("[closePoll] Failed to persist poll close state:", err)
    return {
      ok: false,
      error: {
        status: 500,
        error: "Internal Server Error",
        message: "Failed to close poll. Please try again.",
      },
    }
  }

  if (context.systemEvents) {
    await context.systemEvents.emit(roomId, "POLL_CLOSED", {
      roomId,
      poll: closedPoll,
      results,
      reason,
    })
  }

  if (announce) {
    await postSystemChatMessage({
      context,
      roomId,
      content: `Poll closed: '${poll.question}'`,
      meta: { status: "success", type: "alert" },
    })

    const formatted = formatPollResultsForChat(closedPoll, results)
    await postSystemChatMessage({
      context,
      roomId,
      content: formatted.content,
      contentSegments: formatted.contentSegments,
    })
  }

  return { ok: true, poll: closedPoll, results }
}
