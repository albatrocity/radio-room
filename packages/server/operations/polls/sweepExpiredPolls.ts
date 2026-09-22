import type { AppContext } from "@repo/types"
import { claimDueAutoCloses, getPollRecord } from "../data/polls"
import { closePoll } from "./closePoll"

/**
 * Claim and close polls whose `closesAt` has elapsed (ADR 0189).
 * Safe across dynos: ZREM claim ensures only one worker closes each poll.
 */
export async function sweepExpiredPolls({
  context,
  now = Date.now(),
}: {
  context: AppContext
  now?: number
}): Promise<{ closed: number; skipped: number }> {
  const due = await claimDueAutoCloses({ context, now })
  let closed = 0
  let skipped = 0

  for (const { roomId, pollId } of due) {
    const record = await getPollRecord({ context, roomId, pollId })
    if (!record || record.status !== "open") {
      skipped += 1
      continue
    }

    const result = await closePoll({
      context,
      roomId,
      userId: record.createdBy,
      pollId,
      source: { system: "autoClose" },
      announce: record.announceClose,
      reason: "expired",
    })

    if (result.ok) {
      closed += 1
    } else {
      skipped += 1
    }
  }

  return { closed, skipped }
}
