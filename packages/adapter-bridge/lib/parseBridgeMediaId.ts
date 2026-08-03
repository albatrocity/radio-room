/**
 * Parse a bridge media resource URL into { source, trackId }.
 *
 * Supported forms:
 * - spotify:track:{id}
 * - https://tidal.com/track/{id} (and browse/track variants)
 * - https://www.youtube.com/watch?v={id} / youtu.be/{id}
 * - local:{id}
 * - youtube:{id} / tidal:{id} (legacy scheme forms)
 */
export function parseBridgeMediaId(mediaId: string): { source: string; trackId: string } {
  const trimmed = mediaId.trim()

  if (trimmed.startsWith("spotify:track:")) {
    return { source: "spotify", trackId: trimmed }
  }

  if (trimmed.startsWith("local:")) {
    return { source: "local", trackId: trimmed.slice("local:".length) }
  }

  if (trimmed.startsWith("youtube:")) {
    return { source: "youtube", trackId: trimmed.slice("youtube:".length) }
  }

  if (trimmed.startsWith("tidal:")) {
    return { source: "tidal", trackId: trimmed.slice("tidal:".length) }
  }

  try {
    const url = new URL(trimmed)
    if (url.hostname.includes("youtube.com")) {
      const v = url.searchParams.get("v")
      if (v) return { source: "youtube", trackId: v }
    }
    if (url.hostname === "youtu.be") {
      const id = url.pathname.replace(/^\//, "")
      if (id) return { source: "youtube", trackId: id }
    }
    if (url.hostname.includes("tidal.com")) {
      const match = url.pathname.match(/\/(?:track|browse\/track)\/(\d+)/)
      if (match?.[1]) return { source: "tidal", trackId: match[1] }
    }
  } catch {
    /* not a URL */
  }

  throw new Error(`Unrecognized bridge media id: ${mediaId}`)
}
