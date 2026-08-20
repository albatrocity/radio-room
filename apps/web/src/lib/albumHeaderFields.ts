/**
 * Display fields shared by every album hero (`AlbumViewHeader`) and track row.
 * Both are derived from whatever the source gave us — a browse album, a
 * Physical Media item, or just the first track — so the fallbacks live here
 * rather than in each `albumHeader` memo.
 */

/** Comma-joined artist names, or undefined when there are none to show. */
export function artistsLabel(artists?: Array<{ title?: string }>): string | undefined {
  const names = (artists ?? [])
    .map((artist) => artist.title)
    .filter((title): title is string => Boolean(title))
  return names.length > 0 ? names.join(", ") : undefined
}

/** Year off an ISO-ish release date (`"1997-05-21"` → `"1997"`). */
export function releaseYear(releaseDate?: string): string | undefined {
  return releaseDate?.split("-")[0] || undefined
}
