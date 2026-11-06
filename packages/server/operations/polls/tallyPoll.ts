import type { AppContext } from "@repo/types"
import { getPollVoteWeights, getPollVotes, voteWeight } from "../data/polls"

/**
 * Pure tally: userId → optionId votes into optionId → count.
 * Optionally exclude voters (e.g. the track DJ in Queue Theme). A voter with
 * a stored weight (Pizza Slice, ADR 0228) counts that many times.
 */
export function tallyVotes(
  votes: Record<string, string>,
  options?: { excludeUserIds?: string[]; weights?: Record<string, number> },
): Record<string, number> {
  const exclude =
    options?.excludeUserIds && options.excludeUserIds.length > 0
      ? new Set(options.excludeUserIds)
      : null

  const counts: Record<string, number> = {}
  for (const [userId, optionId] of Object.entries(votes)) {
    if (exclude?.has(userId)) continue
    counts[optionId] = (counts[optionId] ?? 0) + voteWeight(options?.weights, userId)
  }
  return counts
}

/**
 * Load a poll's votes hash and return optionId → count.
 */
export async function tallyPoll({
  context,
  roomId,
  pollId,
  excludeUserIds,
}: {
  context: AppContext
  roomId: string
  pollId: string
  excludeUserIds?: string[]
}): Promise<Record<string, number>> {
  const [votes, weights] = await Promise.all([
    getPollVotes({ context, roomId, pollId }),
    getPollVoteWeights({ context, roomId, pollId }),
  ])
  return tallyVotes(votes, { excludeUserIds, weights })
}
