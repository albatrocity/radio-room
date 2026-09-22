import { randomUUID } from "node:crypto"
import type { AppContext, Poll } from "@repo/types"
import { POLL_CLOSE_DURATION_MS, POLL_OPTION_LIMITS } from "@repo/types"
import { findRoom, isRoomAdmin } from "../data"
import {
  addPollToIndex,
  getActivePollId,
  scheduleAutoClose,
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
  /**
   * Absolute epoch ms deadline. Prefer `durationMs` from clients (clock skew).
   * Plugins on the same process may pass either.
   */
  closesAt?: number | null
  /** Relative duration from server now; preferred for socket/admin callers (ADR 0189). */
  durationMs?: number | null
  /**
   * When set, skip the room-admin gate (ADR 0152). Socket/admin callers omit this.
   */
  source?: { pluginName: string }
  /** When false, skip “New poll started” chat. Defaults to true. Also reused on auto-close. */
  announce?: boolean
}

export type CreatePollResult =
  | { ok: true; poll: Poll }
  | PollOperationFailure
  | { ok: false; error: { status: 409; error: string; message: string } }

function resolveClosesAt(params: {
  closesAt?: number | null
  durationMs?: number | null
  now: number
}): { ok: true; closesAt: number | null } | { ok: false; message: string } {
  const { closesAt, durationMs, now } = params

  if (durationMs != null) {
    if (!Number.isFinite(durationMs) || durationMs < POLL_CLOSE_DURATION_MS.min) {
      return {
        ok: false,
        message: `Poll duration must be at least ${POLL_CLOSE_DURATION_MS.min / 1000} seconds.`,
      }
    }
    if (durationMs > POLL_CLOSE_DURATION_MS.max) {
      return {
        ok: false,
        message: `Poll duration must be at most ${POLL_CLOSE_DURATION_MS.max / 3_600_000} hours.`,
      }
    }
    return { ok: true, closesAt: now + durationMs }
  }

  if (closesAt != null) {
    if (!Number.isFinite(closesAt)) {
      return { ok: false, message: "Invalid closesAt." }
    }
    const duration = closesAt - now
    if (duration < POLL_CLOSE_DURATION_MS.min) {
      return {
        ok: false,
        message: `Poll duration must be at least ${POLL_CLOSE_DURATION_MS.min / 1000} seconds.`,
      }
    }
    if (duration > POLL_CLOSE_DURATION_MS.max) {
      return {
        ok: false,
        message: `Poll duration must be at most ${POLL_CLOSE_DURATION_MS.max / 3_600_000} hours.`,
      }
    }
    return { ok: true, closesAt }
  }

  return { ok: true, closesAt: null }
}

export async function createPoll({
  context,
  roomId,
  userId,
  question,
  options,
  settings,
  closesAt: closesAtInput,
  durationMs,
  source,
  announce = true,
}: CreatePollInput): Promise<CreatePollResult> {
  const room = await findRoom({ context, roomId })
  if (!room) {
    return { ok: false, error: { status: 404, error: "Not Found", message: "Room not found." } }
  }

  if (!source?.pluginName) {
    const isAdmin = await isRoomAdmin({ context, roomId, userId, roomCreator: room.creator })
    if (!isAdmin) {
      return {
        ok: false,
        error: { status: 403, error: "Forbidden", message: "You are not a room admin." },
      }
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

  const now = Date.now()
  const resolved = resolveClosesAt({ closesAt: closesAtInput, durationMs, now })
  if (!resolved.ok) {
    return {
      ok: false,
      error: { status: 400, error: "Bad Request", message: resolved.message },
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
    closesAt: resolved.closesAt,
  }

  await writePoll({ context, poll, announceClose: announce })
  await setActivePollId({ context, roomId, pollId: poll.id })
  await addPollToIndex({ context, roomId, pollId: poll.id, publishedAt: poll.publishedAt })

  if (poll.closesAt != null) {
    await scheduleAutoClose({
      context,
      roomId,
      pollId: poll.id,
      closesAt: poll.closesAt,
    })
  }

  if (context.systemEvents) {
    await context.systemEvents.emit(roomId, "POLL_PUBLISHED", { roomId, poll })
  }

  if (announce) {
    await postSystemChatMessage({
      context,
      roomId,
      content: `New poll started: ${poll.question}`,
      meta: { status: "info", type: "alert" },
    })
  }

  return { ok: true, poll }
}
