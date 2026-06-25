import { SpotifyApi } from "@spotify/web-api-ts-sdk"
import type { MetadataSourceTrack } from "@repo/types"
import { trackItemSchema } from "./schemas"
import {
  getSpotifyClientCredentialsToken,
  SpotifyAppCredentialsError,
} from "./operations/getSpotifyClientCredentialsToken"

export { SpotifyAppCredentialsError }

const DEFAULT_MARKET = "US"
const DEFAULT_LIMIT = 10

/**
 * Search Spotify catalog tracks using a client-credentials app token.
 * Used by the scheduler (no room/user OAuth context).
 */
export async function searchSpotifyCatalog(
  query: string,
  options?: { market?: string; limit?: number },
): Promise<MetadataSourceTrack[]> {
  const trimmed = query.trim()
  if (!trimmed) {
    return []
  }

  const { accessToken, clientId } = await getSpotifyClientCredentialsToken()
  const market = options?.market ?? DEFAULT_MARKET
  const limit = options?.limit ?? DEFAULT_LIMIT

  const spotifyApi = SpotifyApi.withAccessToken(clientId, {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: "",
  })

  const searchResults = await spotifyApi.search(trimmed, ["track"], market, limit)
  return (searchResults.tracks?.items ?? []).map((item) => trackItemSchema.parse(item))
}
