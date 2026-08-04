import type { PluginStorage } from "@repo/types"

/** Bounded leaderboard slice for hot socket / award paths (full board via getComponentState). */
export const HOT_LEADERBOARD_TOP_N = 25

export type ZsetEntry = { score: number; value: string }

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
