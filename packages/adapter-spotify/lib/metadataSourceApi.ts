import { MetadataSourceApi, MetadataSourceLifecycleCallbacks } from "@repo/types"
import { AccessToken, SpotifyApi } from "@spotify/web-api-ts-sdk"
import { mapSpotifyAlbumTrack, mapSpotifyBrowseAlbum, mapSpotifyBrowseArtist } from "./browseMappers"
import { trackItemSchema } from "./schemas"
import { spotifySdkConfig } from "./spotifyRequestTimeout"

export async function makeApi({
  token,
  clientId,
  config,
}: {
  token: AccessToken
  clientId: string
  config: MetadataSourceLifecycleCallbacks
}) {
  const spotifyApi = SpotifyApi.withAccessToken(clientId, token, spotifySdkConfig)

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

    getBrowseCapabilities() {
      return { entryMode: "search" as const, albumSearch: true }
    },

    async listArtists(params) {
      const query = params?.query?.trim()
      if (!query) return { items: [], total: 0 }
      const limit = Math.min(Math.max(params?.limit ?? 20, 1), 50) as 20
      const offset = Math.max(params?.offset ?? 0, 0)
      const results = await spotifyApi.search(query, ["artist"], undefined, limit, offset)
      const items = (results.artists?.items ?? []).map((a) => mapSpotifyBrowseArtist(a))
      return { items, total: results.artists?.total }
    },

    async listAlbums(params) {
      const query = params?.query?.trim()
      if (!query) return { items: [], total: 0 }
      const limit = Math.min(Math.max(params?.limit ?? 20, 1), 50) as 20
      const offset = Math.max(params?.offset ?? 0, 0)
      const results = await spotifyApi.search(query, ["album"], undefined, limit, offset)
      const items = (results.albums?.items ?? []).map((a) => mapSpotifyBrowseAlbum(a))
      return { items, total: results.albums?.total }
    },

    async getArtist(artistId) {
      if (!artistId) return null
      try {
        const [artist, albumsPage] = await Promise.all([
          spotifyApi.artists.get(artistId),
          spotifyApi.artists.albums(artistId, "album,single", undefined, 50, 0),
        ])
        return {
          artist: mapSpotifyBrowseArtist(artist),
          albums: (albumsPage.items ?? []).map((a) => mapSpotifyBrowseAlbum(a)),
        }
      } catch (error) {
        console.error("Error browsing Spotify artist:", error)
        return null
      }
    },

    async getAlbum(albumId) {
      if (!albumId) return null
      try {
        const album = await spotifyApi.albums.get(albumId)
        const browseAlbum = mapSpotifyBrowseAlbum(album)
        const albumEnvelope = {
          id: album.id,
          name: album.name,
          uri: album.uri,
          images: album.images ?? [],
          artists: (album.artists ?? []).map((a) => ({
            id: a.id,
            name: a.name,
            uri: a.uri,
          })),
          release_date: album.release_date,
          release_date_precision: album.release_date_precision as "day" | "month" | "year",
          total_tracks: album.total_tracks,
        }
        const trackItems = album.tracks?.items ?? []
        const tracks = trackItems.map((t) =>
          mapSpotifyAlbumTrack(
            {
              id: t.id,
              name: t.name,
              uri: t.uri,
              duration_ms: t.duration_ms,
              explicit: t.explicit,
              track_number: t.track_number,
              disc_number: t.disc_number,
              artists: t.artists.map((a) => ({ id: a.id, name: a.name, uri: a.uri })),
              external_urls: t.external_urls,
              preview_url: t.preview_url,
            },
            albumEnvelope,
          ),
        )
        browseAlbum.trackCount = tracks.length
        return { album: browseAlbum, tracks }
      } catch (error) {
        console.error("Error browsing Spotify album:", error)
        return null
      }
    },
  }

  return api
}
