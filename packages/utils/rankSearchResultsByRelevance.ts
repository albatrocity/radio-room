import Fuse from "fuse.js"
import type { MetadataSourceTrack } from "@repo/types"

export type RankableSearchTrack = MetadataSourceTrack & { source?: string }

/**
 * Rank multi-source DJ search results by fuzzy relevance to the query.
 * Uses Fuse.js (lower score = better). Non-matches (if any) keep original
 * relative order at the end. Ties break by original index.
 */
export function rankSearchResultsByRelevance<T extends RankableSearchTrack>(
  query: string,
  items: T[],
): T[] {
  const q = query.trim()
  if (!q || items.length <= 1) return items

  const indexed = items.map((item, index) => ({ item, index }))
  const fuse = new Fuse(indexed, {
    keys: [
      { name: "item.title", weight: 2 },
      { name: "item.artists.title", weight: 1.5 },
      { name: "item.album.title", weight: 0.5 },
    ],
    includeScore: true,
    ignoreLocation: true,
    // Score every item; we only use scores for ordering, not filtering.
    threshold: 1,
    shouldSort: false,
  })

  const results = fuse.search(q)
  const matchedIndexes = new Set(results.map((r) => r.item.index))

  const ranked = results
    .slice()
    .sort((a, b) => {
      const scoreA = a.score ?? 1
      const scoreB = b.score ?? 1
      if (scoreA !== scoreB) return scoreA - scoreB
      return a.item.index - b.item.index
    })
    .map((r) => r.item.item)

  const unmatched = items.filter((_, i) => !matchedIndexes.has(i))
  return [...ranked, ...unmatched]
}
