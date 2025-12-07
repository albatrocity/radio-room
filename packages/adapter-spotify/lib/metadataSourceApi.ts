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
    await config.onAuthenticationFailed?.(error)
    throw error
  }

  config.onAuthenticationCompleted?.()

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
      const { title, artists, album } = params

      // Build Spotify search query with proper field syntax
      // https://developer.spotify.com/documentation/web-api/reference/search
      const queryParts: string[] = []

      if (title) {
        queryParts.push(`track:"${title}"`)
      }

      // Artists is an array of { id, title, urls } objects
      if (artists && artists.length > 0) {
        const artistNames = artists.map((a) => a.title).filter(Boolean)
        if (artistNames.length > 0) {
          // Use the first artist for more precise matching
          queryParts.push(`artist:"${artistNames[0]}"`)
        }
      }

      // Album is an object with title property
      if (album?.title) {
        queryParts.push(`album:"${album.title}"`)
      }

      const query = queryParts.join(" ")
      return this.search(query)
    },
    // Playlist creation
    async createPlaylist(params) {
      const { title, trackIds, userId } = params

      // Create the playlist
      const playlist = await spotifyApi.playlists.createPlaylist(userId, {
        name: title,
        description: `Created by Radio Room on ${new Date().toLocaleDateString()}`,
        public: false,
      })

      // Add tracks to playlist (Spotify URIs format: spotify:track:id)
      const uris = trackIds.map((id) => `spotify:track:${id}`)
      if (uris.length > 0) {
        await spotifyApi.playlists.addItemsToPlaylist(playlist.id, uris)
      }

      return {
        id: playlist.id,
        title: playlist.name,
        trackIds,
        url: playlist.external_urls?.spotify,
      }
    },
    // Library management methods
    async getSavedTracks() {
      const savedTracks = await spotifyApi.currentUser.tracks.savedTracks()
      // Transform Spotify tracks to MetadataSourceTrack format
      return (savedTracks.items ?? []).map((item) => trackItemSchema.parse(item.track))
    },
    async checkSavedTracks(trackIds: string[]) {
      if (!trackIds || trackIds.length === 0) {
        return []
      }

      // All IDs should be valid Spotify IDs now (metadataSource ensures this)
      const result = await spotifyApi.currentUser.tracks.hasSavedTracks(trackIds)
      return result
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
