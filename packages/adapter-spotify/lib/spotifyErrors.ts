/**
 * Spotify's Web API (and the official SDK validator) intermittently answers
 * 502/503/504 for requests that often succeed on retry.
 */
export function isSpotifyGatewayError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    /\b(502|503|504)\b/.test(message) &&
    /(bad gateway|service unavailable|gateway time-?out)/i.test(message)
  )
}
