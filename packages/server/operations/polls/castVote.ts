import type { AppContext } from "@repo/types"
import { tryCastVote } from "../data/polls"

export type CastVoteResult =
  | {
      ok: true
      pollId: string
      optionId: string
      isFirstVote: boolean
      totalVotes: number | null
    }
  | { ok: false; reason: "POLL_CLOSED" | "POLL_NOT_FOUND" | "INVALID_OPTION" }

export async function castVote({
  context,
  roomId,
  pollId,
  userId,
  optionId,
}: {
  context: AppContext
  roomId: string
  pollId: string
  userId: string
  optionId: string
}): Promise<CastVoteResult> {
  const result = await tryCastVote({ context, roomId, pollId, userId, optionId })

  if (!result.ok) {
    return result
  }

  if (result.isFirstVote && context.systemEvents) {
    await context.systemEvents.emit(roomId, "POLL_VOTE_CAST", {
      roomId,
      pollId,
      totalVotes: result.totalVotes,
    })
  }

  return {
    ok: true,
    pollId,
    optionId,
    isFirstVote: result.isFirstVote,
    totalVotes: result.totalVotes,
  }
}
