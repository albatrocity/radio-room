import type { MetadataSourceTrack } from "@repo/types"

/**
 * Score catalog search results against title/artist/(optional) album.
 * Shared by Tidal adapter enrichment and bridge cross-source dedup.
 *
 * @returns Best match with score >= 100 (artist+title), or null
 */
export function findBestMatch(
  results: MetadataSourceTrack[],
  inputArtist: string,
  inputTitle: string,
  inputAlbum?: string,
): { track: MetadataSourceTrack; index: number; score: number } | null {
  const artistIn = inputArtist.toLowerCase()
  const titleIn = inputTitle.toLowerCase()
  const albumIn = inputAlbum?.toLowerCase()
  let bestMatch: { track: MetadataSourceTrack; index: number; score: number } | null = null

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const resultArtist =
      result.artists
        ?.map((a: { title: string }) => a.title)
        .join(", ")
        .toLowerCase() ?? ""
    const resultTitle = result.title.toLowerCase()
    const resultAlbum = result.album?.title?.toLowerCase() ?? ""

    let score = 0

    const artistMatch =
      resultArtist.includes(artistIn) ||
      artistIn.includes(resultArtist) ||
      result.artists?.some(
        (a: { title: string }) =>
          a.title.toLowerCase().includes(artistIn) || artistIn.includes(a.title.toLowerCase()),
      )
    if (artistMatch) score += 50

    const titleMatch = resultTitle.includes(titleIn) || titleIn.includes(resultTitle)
    if (titleMatch) score += 50

    if (resultArtist === artistIn) score += 20
    if (resultTitle === titleIn) score += 20

    if (albumIn && resultAlbum) {
      const albumMatch = resultAlbum.includes(albumIn) || albumIn.includes(resultAlbum)
      if (albumMatch) score += 30
      if (resultAlbum === albumIn) score += 20
    }

    if (score >= 100 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { track: result, index: i, score }
    }
  }

  return bestMatch
}

/**
 * Collapse overlapping Spotify/Tidal search rows by priority.
 * youtube/local pass through unless includeDistinct is true and they fuzzy-match.
 */
export function dedupeSearchResultsByPriority<T extends MetadataSourceTrack & { source?: string }>(
  items: T[],
  priority: string[] = ["spotify", "tidal"],
  options?: { collapseDistinct?: boolean },
): T[] {
  const interchangeable = new Set(priority)
  const kept: T[] = []
  const winners: T[] = []

  for (const item of items) {
    const source = item.source ?? "unknown"
    if (!interchangeable.has(source) && !options?.collapseDistinct) {
      kept.push(item)
      continue
    }

    const artist = item.artists?.[0]?.title ?? ""
    const title = item.title
    const album = item.album?.title

    let matchedWinner: T | undefined
    for (const w of winners) {
      const match = findBestMatch(
        [w],
        artist.toLowerCase(),
        title.toLowerCase(),
        album?.toLowerCase(),
      )
      if (match) {
        matchedWinner = w
        break
      }
    }

    if (!matchedWinner) {
      winners.push(item)
      kept.push(item)
      continue
    }

    const existingSource = matchedWinner.source ?? "unknown"
    const existingRank = priority.indexOf(existingSource)
    const newRank = priority.indexOf(source)
    if (newRank >= 0 && (existingRank < 0 || newRank < existingRank)) {
      const idx = kept.indexOf(matchedWinner)
      if (idx >= 0) kept[idx] = item
      const widx = winners.indexOf(matchedWinner)
      if (widx >= 0) winners[widx] = item
    }
  }

  return kept
}
