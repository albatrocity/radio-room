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
      const searchResults = await spotifyApi.search(query, ["track"], undefined, 10)
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
    // Playlist creation (POST /me/playlists, POST /playlists/{id}/items per Feb 2026 migration)
    async createPlaylist(params) {
      const { title, trackIds, userId: _userId } = params
      // _userId accepted for API compatibility; we use POST /me/playlists (current user only)

      // Create the playlist for the current user (POST /me/playlists)
      const playlist = await spotifyApi.makeRequest<{ id: string; name: string; external_urls?: { spotify?: string } }>(
        "POST",
        "me/playlists",
        {
          name: title,
          description: `Created by Listening Room on ${new Date().toLocaleDateString()}`,
          public: false,
        },
      )

      // Add tracks via new items endpoint (POST /playlists/{id}/items)
      const uris = trackIds.map((id) => `spotify:track:${id}`)
      if (uris.length > 0 && playlist) {
        await spotifyApi.makeRequest("POST", `playlists/${playlist.id}/items`, { uris })
      }

      return {
        id: playlist!.id,
        title: playlist!.name,
        trackIds,
        url: playlist!.external_urls?.spotify,
      }
    },
    // Library management methods
    // getSavedTracks: still uses existing GET saved-tracks list endpoint (not replaced in Feb 2026 migration)
    async getSavedTracks() {
      const savedTracks = await spotifyApi.currentUser.tracks.savedTracks()
      // Transform Spotify tracks to MetadataSourceTrack format
      return (savedTracks.items ?? []).map((item) => trackItemSchema.parse(item.track))
    },
    async checkSavedTracks(trackIds: string[]) {
      if (!trackIds || trackIds.length === 0) {
        return []
      }
      const uris = trackIds.map((id) => `spotify:track:${id}`)
      const query = `me/library/contains?uris=${encodeURIComponent(uris.join(","))}`
      const result = await spotifyApi.makeRequest<boolean[]>("GET", query)
      return result ?? []
    },
    async addToLibrary(trackIds: string[]) {
      const uris = trackIds.map((id) => `spotify:track:${id}`)
      await spotifyApi.makeRequest("PUT", "me/library", { uris })
    },
    async removeFromLibrary(trackIds: string[]) {
      const uris = trackIds.map((id) => `spotify:track:${id}`)
      await spotifyApi.makeRequest("DELETE", "me/library", { uris })
    },
  }

  return api
}
