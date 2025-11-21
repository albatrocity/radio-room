import { MetadataSourceApi, MetadataSourceLifecycleCallbacks } from "@repo/types"
import { AccessToken, SpotifyApi } from "@spotify/web-api-ts-sdk"
import { trackItemSchema } from "./schemas"

export async function makeApi({
  token,
  clientId,
  config,
}: {
  token: AccessToken
  clientId: string
  config: MetadataSourceLifecycleCallbacks
}) {
  const spotifyApi = SpotifyApi.withAccessToken(clientId, token)

  const accessToken = await spotifyApi.getAccessToken()

  if (!accessToken) {
    const error = new Error("Failed to get access token")
    await config.onAuthenticationFailed(error)
    throw error
  }

  config.onAuthenticationCompleted()

  const api: MetadataSourceApi = {
    async search(query) {
      const searchResults = await spotifyApi.search(query, ["track"])
      return (searchResults.tracks?.items ?? []).map((item) => trackItemSchema.parse(item))
    },
    async findById(id) {
      try {
        const item = await spotifyApi.tracks.get(id)

        return trackItemSchema.parse(item)
      } catch (error) {
        console.error("Error fetching track from Spotify:", error)
        return null
      }
    },
    async searchByParams(params) {
      const { title, artists, album, id } = params
      const query = `track:${title} artist:${artists.join(" OR ")} album:${album} id:${id}`
      return this.search(query)
    },
    // Library management methods
    async checkSavedTracks(trackIds: string[]) {
      return await spotifyApi.currentUser.tracks.hasSavedTracks(trackIds)
    },
    async addToLibrary(trackIds: string[]) {
      // The Spotify API PUT /v1/me/tracks expects body: { ids: [...] }
      // but the SDK's saveTracks sends the array directly, so we need to use makeRequest
      await spotifyApi.makeRequest("PUT", "me/tracks", { ids: trackIds })
    },
    async removeFromLibrary(trackIds: string[]) {
      // The Spotify API DELETE /v1/me/tracks expects body: { ids: [...] }
      await spotifyApi.makeRequest("DELETE", "me/tracks", { ids: trackIds })
    },
  }

  return api
}
