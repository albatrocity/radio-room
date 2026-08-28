import {
  AdapterAuthentication,
  MetadataSourceApi,
  MetadataSourceLifecycleCallbacks,
} from "@repo/types"
import { isMetadataSourceAuthFailure } from "@repo/utils"
import { AccessToken, SpotifyApi } from "@spotify/web-api-ts-sdk"
import {
  mapSpotifyAlbumTrack,
  mapSpotifyBrowseAlbum,
  mapSpotifyBrowseArtist,
} from "./browseMappers"
import { trackItemSchema } from "./schemas"
import { spotifySdkConfig } from "./spotifyRequestTimeout"

function toAccessToken(tokens: { accessToken: string; refreshToken: string }): AccessToken {
  return {
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    token_type: "Bearer",
    expires_in: 3600,
  }
}

export async function makeApi({
  token,
  clientId,
  config,
}: {
  token: AccessToken
  clientId: string
  config: MetadataSourceLifecycleCallbacks & { authentication: AdapterAuthentication }
}) {
  const getSpotifyApi = async (forceRefresh = false): Promise<SpotifyApi> => {
    const auth = config.authentication
    if (auth.type !== "oauth" && auth.type !== "token") {
      return SpotifyApi.withAccessToken(clientId, token, spotifySdkConfig)
    }
    const tokens =
      forceRefresh && auth.type === "oauth" && auth.refreshTokens
        ? await auth.refreshTokens()
        : await auth.getStoredTokens()
    return SpotifyApi.withAccessToken(clientId, toAccessToken(tokens), spotifySdkConfig)
  }

  const withAuthRetry = async <T>(operation: (api: SpotifyApi) => Promise<T>): Promise<T> => {
    try {
      return await operation(await getSpotifyApi())
    } catch (error) {
      const auth = config.authentication
      if (!isMetadataSourceAuthFailure(error) || auth.type !== "oauth" || !auth.refreshTokens) {
        throw error
      }
      return await operation(await getSpotifyApi(true))
    }
  }

  const spotifyApi = await getSpotifyApi()
  const accessToken = await spotifyApi.getAccessToken()

  if (!accessToken) {
    const error = new Error("Failed to get access token")
    await config.onAuthenticationFailed?.(error)
    throw error
  }

  config.onAuthenticationCompleted?.()

  const api: MetadataSourceApi = {
    async search(query) {
      const searchResults = await withAuthRetry((client) =>
        client.search(query, ["track"], undefined, 10),
      )
      return (searchResults.tracks?.items ?? []).map((item) => trackItemSchema.parse(item))
    },
    async findById(id) {
      try {
        const item = await withAuthRetry((client) => client.tracks.get(id))

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

      return withAuthRetry(async (client) => {
        const playlist = await client.makeRequest<{
          id: string
          name: string
          external_urls?: { spotify?: string }
        }>("POST", "me/playlists", {
          name: title,
          description: `Created by Listening Room on ${new Date().toLocaleDateString()}`,
          public: false,
        })

        const uris = trackIds.map((id) => `spotify:track:${id}`)
        if (uris.length > 0 && playlist) {
          await client.makeRequest("POST", `playlists/${playlist.id}/items`, { uris })
        }

        return {
          id: playlist!.id,
          title: playlist!.name,
          trackIds,
          url: playlist!.external_urls?.spotify,
        }
      })
    },
    // Library management methods
    // getSavedTracks: still uses existing GET saved-tracks list endpoint (not replaced in Feb 2026 migration)
    async getSavedTracks() {
      const savedTracks = await withAuthRetry((client) => client.currentUser.tracks.savedTracks())
      // Transform Spotify tracks to MetadataSourceTrack format
      return (savedTracks.items ?? []).map((item) => trackItemSchema.parse(item.track))
    },
    async checkSavedTracks(trackIds: string[]) {
      if (!trackIds || trackIds.length === 0) {
        return []
      }
      const uris = trackIds.map((id) => `spotify:track:${id}`)
      const query = `me/library/contains?uris=${encodeURIComponent(uris.join(","))}`
      const result = await withAuthRetry((client) => client.makeRequest<boolean[]>("GET", query))
      return result ?? []
    },
    async addToLibrary(trackIds: string[]) {
      const uris = trackIds.map((id) => `spotify:track:${id}`)
      await withAuthRetry((client) => client.makeRequest("PUT", "me/library", { uris }))
    },
    async removeFromLibrary(trackIds: string[]) {
      const uris = trackIds.map((id) => `spotify:track:${id}`)
      await withAuthRetry((client) => client.makeRequest("DELETE", "me/library", { uris }))
    },

    getBrowseCapabilities() {
      return { entryMode: "search" as const, albumSearch: true }
    },

    async listArtists(params) {
      const query = params?.query?.trim()
      if (!query) return { items: [], total: 0 }
      const limit = Math.min(Math.max(params?.limit ?? 20, 1), 50) as 20
      const offset = Math.max(params?.offset ?? 0, 0)
      const results = await withAuthRetry((client) =>
        client.search(query, ["artist"], undefined, limit, offset),
      )
      const items = (results.artists?.items ?? []).map((a) => mapSpotifyBrowseArtist(a))
      return { items, total: results.artists?.total }
    },

    async listAlbums(params) {
      const query = params?.query?.trim()
      if (!query) return { items: [], total: 0 }
      const limit = Math.min(Math.max(params?.limit ?? 20, 1), 50) as 20
      const offset = Math.max(params?.offset ?? 0, 0)
      const results = await withAuthRetry((client) =>
        client.search(query, ["album"], undefined, limit, offset),
      )
      const items = (results.albums?.items ?? []).map((a) => mapSpotifyBrowseAlbum(a))
      return { items, total: results.albums?.total }
    },

    async getArtist(artistId) {
      if (!artistId) return null
      try {
        const [artist, albumsPage] = await withAuthRetry((client) =>
          Promise.all([
            client.artists.get(artistId),
            client.artists.albums(artistId, "album,single", undefined, 50, 0),
          ]),
        )
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
        const album = await withAuthRetry((client) => client.albums.get(albumId))
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
