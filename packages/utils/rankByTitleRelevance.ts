import Fuse from "fuse.js"

/**
 * Rank items by fuzzy title relevance to the query (Fuse.js).
 * Same scoring approach as {@link rankSearchResultsByRelevance}, title-only.
 */
export function rankByTitleRelevance<T extends { title: string }>(
  query: string,
  items: T[],
): T[] {
  const q = query.trim()
  if (!q || items.length <= 1) return items

  const indexed = items.map((item, index) => ({ item, index }))
  const fuse = new Fuse(indexed, {
    keys: [{ name: "item.title", weight: 1 }],
    includeScore: true,
    ignoreLocation: true,
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

/** Rank by title relevance, then take the top `limit` items. */
export function takeTopByTitleRelevance<T extends { title: string }>(
  query: string,
  items: T[],
  limit: number,
): T[] {
  return rankByTitleRelevance(query, items).slice(0, limit)
}
