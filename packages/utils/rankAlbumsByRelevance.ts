import Fuse from "fuse.js"

/**
 * Fuse score at or under which a result counts as relevant to the query
 * (0 = exact, 1 = no match). Loose enough for "neil young harvest" to match
 * "Harvest (2009 Remaster)" by Neil Young.
 */
export const RELEVANT_SEARCH_SCORE = 0.4

/**
 * Rank album search hits the way Add to Queue ranks tracks
 * ({@link rankSearchResultsByRelevance}): Fuse.js over title (weight 2) and
 * artist (1.5), lower score first, ties by original order, non-matches last.
 *
 * With `promoteSource`, relevant hits from that source (score ≤
 * `RELEVANT_SEARCH_SCORE`) move ahead of everything else, keeping their order,
 * so an album the room already owns beats the same album from a stream.
 */
export function rankAlbumsByRelevance<T extends { title: string; artist: string; source?: string }>(
  query: string,
  items: T[],
  options: { promoteSource?: string } = {},
): T[] {
  const q = query.trim()
  if (!q || items.length <= 1) return items

  const indexed = items.map((item, index) => ({ item, index }))
  const fuse = new Fuse(indexed, {
    keys: [
      { name: "item.title", weight: 2 },
      { name: "item.artist", weight: 1.5 },
    ],
    includeScore: true,
    ignoreLocation: true,
    // Score every item; scores only order results, never filter them.
    threshold: 1,
    shouldSort: false,
  })

  const results = fuse.search(q)
  const matched = new Set(results.map((r) => r.item.index))
  const ranked = results
    .map((r) => ({ item: r.item.item, index: r.item.index, score: r.score ?? 1 }))
    .sort((a, b) => (a.score !== b.score ? a.score - b.score : a.index - b.index))
  const unmatched = items
    .map((item, index) => ({ item, index, score: 1 }))
    .filter(({ index }) => !matched.has(index))
  const ordered = [...ranked, ...unmatched]

  const promote = options.promoteSource
  if (!promote) return ordered.map(({ item }) => item)
  const isPromoted = (row: (typeof ordered)[number]) =>
    row.item.source === promote && row.score <= RELEVANT_SEARCH_SCORE
  return [...ordered.filter(isPromoted), ...ordered.filter((row) => !isPromoted(row))].map(
    ({ item }) => item,
  )
}
