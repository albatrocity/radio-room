import { DOUBLE_VOTE_FLAG, DOUBLE_VOTE_WEIGHT, activeFlagModifier } from "@repo/game-logic"
import type { AppContext, GameStateModifier } from "@repo/types"
import { getMyVote, tryCastVote } from "../data/polls"

export type CastVoteResult =
  | {
      ok: true
      pollId: string
      optionId: string
      isFirstVote: boolean
      totalVotes: number | null
    }
  | { ok: false; reason: "POLL_CLOSED" | "POLL_NOT_FOUND" | "INVALID_OPTION" }

/** The voter's waiting double-vote charge, read only before their first vote on a poll. */
async function doubleVoteCharge(
  context: AppContext,
  roomId: string,
  pollId: string,
  userId: string,
): Promise<GameStateModifier | undefined> {
  if (!context.gameSessions) return undefined
  if (await getMyVote({ context, roomId, pollId, userId })) return undefined
  const state = await context.gameSessions.getUserState(roomId, userId)
  return activeFlagModifier(state?.modifiers, DOUBLE_VOTE_FLAG, Date.now())
}

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
  const charge = await doubleVoteCharge(context, roomId, pollId, userId)
  const result = await tryCastVote({
    context,
    roomId,
    pollId,
    userId,
    optionId,
    weight: charge ? DOUBLE_VOTE_WEIGHT : 1,
  })

  if (!result.ok) {
    return result
  }

  if (charge && result.isFirstVote) {
    await context.gameSessions.removeModifier(roomId, userId, charge.id)
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
