import type { AppContext } from "@repo/types"
import { getPollVotes } from "../data/polls"

/**
 * Pure tally: userId → optionId votes into optionId → count.
 * Optionally exclude voters (e.g. the track DJ in Queue Theme).
 */
export function tallyVotes(
  votes: Record<string, string>,
  options?: { excludeUserIds?: string[] },
): Record<string, number> {
  const exclude =
    options?.excludeUserIds && options.excludeUserIds.length > 0
      ? new Set(options.excludeUserIds)
      : null

  const counts: Record<string, number> = {}
  for (const [userId, optionId] of Object.entries(votes)) {
    if (exclude?.has(userId)) continue
    counts[optionId] = (counts[optionId] ?? 0) + 1
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
  const votes = await getPollVotes({ context, roomId, pollId })
  return tallyVotes(votes, { excludeUserIds })
}
