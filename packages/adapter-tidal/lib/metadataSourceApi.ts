import { MetadataSourceApi, MetadataSourceLifecycleCallbacks, MetadataSourceTrack, MetadataSourceSearchParameters } from "@repo/types"
import {
  TidalApiClient,
  searchTracks,
  getTrack,
  addToUserCollection,
  removeFromUserCollection,
  checkSavedTracks as checkSavedTracksApi,
  createPlaylist as createPlaylistApi,
  addTracksToPlaylist,
} from "./tidalApi"
import {
  tidalSearchResponseSchema,
  tidalSingleTrackResponseSchema,
  transformTidalTrack,
} from "./schemas"

interface MakeApiParams {
  client: TidalApiClient
  config: MetadataSourceLifecycleCallbacks
  tidalUserId?: string // Tidal user ID for library operations
}

/**
 * Create a MetadataSourceApi implementation for Tidal
 */
export async function makeApi({ client, config, tidalUserId }: MakeApiParams): Promise<MetadataSourceApi> {
  // Notify that authentication completed
  config.onAuthenticationCompleted?.()

  const api: MetadataSourceApi = {
    /**
     * Search for tracks by query string
     */
    async search(query: string): Promise<MetadataSourceTrack[]> {
      try {
        console.log(`[Tidal API] Searching for: "${query}"`)
        const response = await searchTracks(client, query)
        console.log(`[Tidal API] Raw response:`, JSON.stringify(response, null, 2).substring(0, 500))
        
        const parsed = tidalSearchResponseSchema.safeParse(response)

        if (!parsed.success) {
          console.error("[Tidal API] Failed to parse search response:")
          // Log each error
          for (const error of parsed.error.errors) {
            console.error(`[Tidal API]   - Path: ${error.path.join('.')}, Code: ${error.code}, Message: ${error.message}`)
          }
          console.error("[Tidal API] Response was:", JSON.stringify(response, null, 2).substring(0, 1000))
          return []
        }

        console.log(`[Tidal API] Parsed ${parsed.data.data.length} tracks`)
        console.log(`[Tidal API] Included items:`, parsed.data.included?.length ?? 0)
        if (parsed.data.included?.length) {
          console.log(`[Tidal API] Included types:`, [...new Set(parsed.data.included.map(i => i.type))])
          // Log album data to see if imageCover is present
          const albums = parsed.data.included.filter(i => i.type === "albums")
          if (albums.length > 0) {
            console.log(`[Tidal API] Album attributes keys:`, Object.keys(albums[0].attributes ?? {}))
            console.log(`[Tidal API] Album relationships keys:`, Object.keys((albums[0] as any).relationships ?? {}))
          }
          // Log image resources if any
          const images = parsed.data.included.filter(i => i.type === "imageResources" || i.type === "images")
          if (images.length > 0) {
            console.log(`[Tidal API] Found ${images.length} image resources`)
          }
        }
        return parsed.data.data.map((track) =>
          transformTidalTrack(track, parsed.data.included),
        )
      } catch (error) {
        console.error("[Tidal API] Error searching:", error)
        config.onError?.(error instanceof Error ? error : new Error(String(error)))
        return []
      }
    },

    /**
     * Find a track by ID
     */
    async findById(id: string): Promise<MetadataSourceTrack | null> {
      try {
        const response = await getTrack(client, id)
        const parsed = tidalSingleTrackResponseSchema.safeParse(response)

        if (!parsed.success) {
          console.error("Failed to parse Tidal track response:", parsed.error)
          return null
        }

        return transformTidalTrack(parsed.data.data, parsed.data.included)
      } catch (error) {
        console.error("Error fetching track from Tidal:", error)
        return null
      }
    },

    /**
     * Search for tracks by structured parameters
     */
    async searchByParams(params: MetadataSourceSearchParameters): Promise<MetadataSourceTrack[]> {
      const { title, artists, album } = params
      const artistNames = artists.map((a: { title: string }) => a.title).join(" ")
      const query = `${title} ${artistNames} ${album?.title ?? ""}`.trim()
      return this.search(query)
    },

    /**
     * Check if tracks are saved in user's library
     * Only works for room creator with Tidal auth
     */
    async checkSavedTracks(trackIds: string[]): Promise<boolean[]> {
      if (!tidalUserId) {
        // No user ID available, can't check library
        return trackIds.map(() => false)
      }

      try {
        return await checkSavedTracksApi(client, tidalUserId, trackIds)
      } catch (error) {
        console.error("Error checking saved tracks:", error)
        return trackIds.map(() => false)
      }
    },

    /**
     * Add tracks to user's library
     * Only works for room creator with Tidal auth
     */
    async addToLibrary(trackIds: string[]): Promise<void> {
      if (!tidalUserId) {
        throw new Error("Tidal user ID not available for library operations")
      }

      await addToUserCollection(client, tidalUserId, trackIds)
    },

    /**
     * Remove tracks from user's library
     * Only works for room creator with Tidal auth
     */
    async removeFromLibrary(trackIds: string[]): Promise<void> {
      if (!tidalUserId) {
        throw new Error("Tidal user ID not available for library operations")
      }

      await removeFromUserCollection(client, tidalUserId, trackIds)
    },

    /**
     * Create a playlist and add tracks to it
     * Requires playlists.write scope and Tidal auth
     */
    async createPlaylist(params: {
      title: string
      trackIds: string[]
      userId: string
    }): Promise<{ title: string; trackIds: string[]; id: string; url?: string }> {
      if (!tidalUserId) {
        throw new Error("Tidal user ID not available for playlist operations")
      }

      console.log(`[Tidal MetadataSource] Creating playlist "${params.title}" with ${params.trackIds.length} tracks`)

      // Step 1: Create the empty playlist
      const playlist = await createPlaylistApi(
        client,
        tidalUserId,
        params.title,
        `Created from Radio Room on ${new Date().toLocaleDateString()}`,
      )

      // Step 2: Add tracks to the playlist
      if (params.trackIds.length > 0) {
        await addTracksToPlaylist(client, playlist.id, params.trackIds)
      }

      console.log(`[Tidal MetadataSource] ✓ Playlist created: ${playlist.url}`)

      return {
        title: playlist.title,
        trackIds: params.trackIds,
        id: playlist.id,
        url: playlist.url,
      }
    },

    // Note: getSavedTracks is not implemented for Tidal yet
  }

  return api
}

