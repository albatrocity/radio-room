export const PUBLIC_URL_TAG_TOKENS = [
  "wcom",
  "wpay",
  "woaf",
  "woas",
  "wxxx",
  "woar",
  "purchaseurl",
  "bandcamp",
  "url",
  "website",
  "comment",
  "musicbrainz",
] as const

export type PublicUrlTagToken = (typeof PUBLIC_URL_TAG_TOKENS)[number]

export const DEFAULT_PUBLIC_URL_TAG_PRIORITY: PublicUrlTagToken[] = [
  "wcom",
  "wpay",
  "woaf",
  "woas",
  "wxxx",
  "woar",
  "purchaseurl",
  "bandcamp",
  "url",
  "website",
  "comment",
  "musicbrainz",
]

export type PublicUrlCandidates = Partial<Record<PublicUrlTagToken, string>>

/** True for guest-reachable http(s) URLs (not file:, localhost, or private hosts). */
export function isValidPublicHttpUrl(value: string | undefined | null): value is string {
  if (typeof value !== "string") return false
  const trimmed = value.trim()
  if (!trimmed) return false
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return false
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false
  const host = url.hostname.toLowerCase()
  if (host === "localhost" || host === "0.0.0.0" || host === "::1") return false
  if (host.endsWith(".local")) return false
  if (/^127\./.test(host)) return false
  if (/^10\./.test(host)) return false
  if (/^192\.168\./.test(host)) return false
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false
  return true
}

export function pickPublicUrl(
  candidates: PublicUrlCandidates,
  priority: readonly PublicUrlTagToken[] = DEFAULT_PUBLIC_URL_TAG_PRIORITY,
): string | undefined {
  for (const token of priority) {
    const url = candidates[token]
    if (isValidPublicHttpUrl(url)) return url.trim()
  }
  return undefined
}
