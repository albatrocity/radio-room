export class SpotifyAppCredentialsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SpotifyAppCredentialsError"
  }
}

type CachedToken = {
  accessToken: string
  clientId: string
  expiresAt: number
}

let cached: CachedToken | null = null

/** Buffer before expiry when refreshing the in-memory app token. */
const EXPIRY_BUFFER_MS = 60_000

/**
 * Spotify client-credentials token for catalog search (no user OAuth).
 * Cached in memory until shortly before expiry.
 */
export async function getSpotifyClientCredentialsToken(): Promise<{
  accessToken: string
  clientId: string
}> {
  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new SpotifyAppCredentialsError(
      "SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET must be set for scheduler track search",
    )
  }

  const now = Date.now()
  if (cached && cached.clientId === clientId && cached.expiresAt > now + EXPIRY_BUFFER_MS) {
    return { accessToken: cached.accessToken, clientId: cached.clientId }
  }

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(clientId + ":" + clientSecret).toString("base64"),
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new SpotifyAppCredentialsError(
      `Failed to obtain Spotify app token: ${response.status} ${error}`,
    )
  }

  const data = (await response.json()) as {
    access_token: string
    expires_in: number
    token_type: string
  }

  cached = {
    accessToken: data.access_token,
    clientId,
    expiresAt: now + data.expires_in * 1000,
  }

  return { accessToken: cached.accessToken, clientId: cached.clientId }
}

/** Test helper: clear in-memory token cache. */
export function clearSpotifyClientCredentialsTokenCache(): void {
  cached = null
}
