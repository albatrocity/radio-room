import type { PluginAPI, PluginStorage } from "@repo/types"

/** Bounded leaderboard slice for hot socket / award paths (full board via getComponentState). */
export const HOT_LEADERBOARD_TOP_N = 25

export type ZsetEntry = { score: number; value: string }

export interface LeaderboardEntry {
  score: number
  value: string
  username: string
}

/**
 * Top-N by score from an ascending Redis ZRANGE (highest scores are at the end).
 * Returns entries highest-score-first.
 */
export async function fetchTopZsetEntries(
  storage: Pick<PluginStorage, "zrangeWithScores">,
  key: string,
  topN: number,
): Promise<ZsetEntry[]> {
  if (topN <= 0) return []
  const raw = await storage.zrangeWithScores(key, -topN, -1)
  return [...raw].reverse()
}

/**
 * Reusable leaderboard backed by a Redis sorted set (ADR 0192).
 *
 * Replaces the six hand-rolled leaderboard implementations across plugins.
 * Usernames are hydrated via `getUsersByIds`, falling back to the userId.
 */
export function createLeaderboard(opts: {
  storage: Pick<PluginStorage, "zincrby" | "zrangeWithScores" | "del">
  api: Pick<PluginAPI, "getUsersByIds">
  key: string
}) {
  const { storage, api, key } = opts

  return {
    /** Increment a user's score by `n` (default 1). */
    async increment(userId: string, n: number = 1): Promise<number> {
      return storage.zincrby(key, n, userId)
    },

    /**
     * Top entries with hydrated usernames.
     * @param topN - Number of entries to return. Omit for full board.
     */
    async top({ topN }: { topN?: number } = {}): Promise<LeaderboardEntry[]> {
      const sorted =
        topN != null && topN > 0
          ? await fetchTopZsetEntries(storage, key, topN)
          : [...(await storage.zrangeWithScores(key, 0, -1))].sort(
              (a, b) => b.score - a.score,
            )
      if (sorted.length === 0) return []
      const users = await api.getUsersByIds(sorted.map((e) => e.value))
      const nameById = new Map(users.map((u) => [u.userId, u.username]))
      return sorted.map((entry) => ({
        score: entry.score,
        value: entry.value,
        username: nameById.get(entry.value) ?? entry.value,
      }))
    },

    /** All entries with hydrated usernames (alias for `top()` with no cap). */
    async all(): Promise<LeaderboardEntry[]> {
      return this.top()
    },

    /** Delete the entire sorted set. */
    async reset(): Promise<void> {
      await storage.del(key)
    },
  }
}
