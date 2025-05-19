import { MetadataSourceApi, PlaybackControllerAdapterConfig } from "@repo/types"
import { AccessToken, SpotifyApi } from "@spotify/web-api-ts-sdk"
import { trackItemSchema } from "./schemas"

export async function makeApi({
  token,
  clientId,
  config,
}: {
  token: AccessToken
  clientId: string
  config: PlaybackControllerAdapterConfig
}) {
  const spotifyApi = SpotifyApi.withAccessToken(clientId, token)

  const accessToken = await spotifyApi.getAccessToken()

  if (!accessToken) {
    const error = new Error("Failed to get access token")
    await config.onAuthenticationFailed(error)
    throw error
  }

  config.onAuthenticationCompleted({
    accessToken: accessToken.access_token,
    refreshToken: accessToken.refresh_token,
    expiresIn: accessToken.expires_in,
  })

  const api: MetadataSourceApi = {
    async search(query) {
      const searchResults = await spotifyApi.search(query, ["track"])
      return (searchResults.tracks?.items ?? []).map((item) => trackItemSchema.parse(item))
    },
    async findById(id) {
      const item = await spotifyApi.tracks.get(id)
      return trackItemSchema.parse(item)
    },
    async searchByParams(params) {
      const { title, artists, album, id } = params
      const query = `track:${title} artist:${artists.join(" OR ")} album:${album} id:${id}`
      return this.search(query)
    },
  }

  return api
}
