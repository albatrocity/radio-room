import { randomUUID } from "node:crypto"
import type { AppContext, Poll } from "@repo/types"
import { POLL_OPTION_LIMITS } from "@repo/types"
import { findRoom, isRoomAdmin } from "../data"
import {
  addPollToIndex,
  getActivePollId,
  setActivePollId,
  writePoll,
} from "../data/polls"
import { postSystemChatMessage } from "./postSystemChatMessage"
import type { PollOperationFailure } from "./types"

export type CreatePollInput = {
  context: AppContext
  roomId: string
  userId: string
  question: string
  options: { label: string }[]
  settings?: { hideRunningTotal?: boolean }
}

export type CreatePollResult =
  | { ok: true; poll: Poll }
  | PollOperationFailure
  | { ok: false; error: { status: 409; error: string; message: string } }

export async function createPoll({
  context,
  roomId,
  userId,
  question,
  options,
  settings,
}: CreatePollInput): Promise<CreatePollResult> {
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

  if (options.length < POLL_OPTION_LIMITS.min) {
    return {
      ok: false,
      error: {
        status: 400,
        error: "Bad Request",
        message: `A poll needs at least ${POLL_OPTION_LIMITS.min} options.`,
      },
    }
  }

  const activePollId = await getActivePollId({ context, roomId })
  if (activePollId) {
    return {
      ok: false,
      error: {
        status: 409,
        error: "Conflict",
        message: "Another poll is already active. Close it before publishing a new one.",
      },
    }
  }

  const now = Date.now()
  const poll: Poll = {
    id: randomUUID(),
    roomId,
    question,
    options: options.map((o) => ({ id: randomUUID(), label: o.label })),
    status: "open",
    settings: { hideRunningTotal: settings?.hideRunningTotal ?? false },
    createdAt: now,
    createdBy: userId,
    publishedAt: now,
    closedAt: null,
    closesAt: null,
  }

  await writePoll({ context, poll })
  await setActivePollId({ context, roomId, pollId: poll.id })
  await addPollToIndex({ context, roomId, pollId: poll.id, publishedAt: poll.publishedAt })

  if (context.systemEvents) {
    await context.systemEvents.emit(roomId, "POLL_PUBLISHED", { roomId, poll })
  }

  await postSystemChatMessage({
    context,
    roomId,
    content: `New poll started: ${poll.question}`,
    meta: { status: "info", type: "alert" },
  })

  return { ok: true, poll }
}
