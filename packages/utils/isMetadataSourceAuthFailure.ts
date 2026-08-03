/**
 * Detect OAuth / token failures from metadata source APIs (Spotify, etc.).
 * Used to surface re-auth UI instead of silent empty search results.
 */
export function isMetadataSourceAuthFailure(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase()
  if (!msg) return false
  return (
    msg.includes("bad or expired token") ||
    msg.includes("re-authenticate") ||
    msg.includes("token has expired") ||
    msg.includes("access token has expired") ||
    msg.includes("invalid_grant") ||
    msg.includes("no auth tokens found") ||
    (msg.includes("unauthorized") && msg.includes("token"))
  )
}
