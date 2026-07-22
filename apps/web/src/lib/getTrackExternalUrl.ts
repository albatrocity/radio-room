type UrlEntry = { type?: string; url?: string }

/**
 * Prefer a guest-clickable http(s) resource URL over opaque URIs
 * (`spotify:track:…`, `local:…`).
 */
export function getTrackExternalUrl(track: {
  external_urls?: { spotify?: string }
  urls?: UrlEntry[]
} | null | undefined): string | null {
  const spotify = track?.external_urls?.spotify
  if (typeof spotify === "string" && /^https?:\/\//i.test(spotify)) return spotify

  const resources = track?.urls?.filter((u) => u.type === "resource") ?? []
  for (const entry of resources) {
    const url = entry.url
    if (typeof url === "string" && /^https?:\/\//i.test(url)) return url
  }
  return null
}
