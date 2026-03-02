import {
  MetadataSourceApi,
  MetadataSourceLifecycleCallbacks,
  MetadataSourceTrack,
  MetadataSourceSearchParameters,
} from "@repo/types"
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

/**
 * FUTURE ENHANCEMENT: ISRC-based lookup
 *
 * Tidal's API supports looking up tracks by ISRC (International Standard Recording Code):
 *   GET /tracks?filter[isrc]={ISRC}&countryCode={CC}
 *
 * This would provide much more accurate matching than text search, as ISRC is a unique
 * identifier for a specific recording. To implement this:
 *
 * 1. Add `isrc` field to MetadataSourceTrack type
 * 2. Have Spotify include ISRC in its enriched track data (it's available via their API)
 * 3. Add `isrc` field to MediaSourceSubmission
 * 4. Add `findByIsrc(isrc: string)` method to MetadataSourceApi interface
 * 5. Implement ISRC lookup in this adapter using:
 *    GET /tracks?filter[isrc]=${isrc}&countryCode=${countryCode}
 *
 * When ISRC is available, use it first for exact matching. Fall back to text search
 * with the scoring logic below if ISRC lookup fails.
 *
 * Reference: https://tidal-music.github.io/tidal-api-reference/
 */

/**
 * Find the best matching track from search results.
 * Tidal's search API can return results that don't closely match the input,
 * so we score results and only return tracks that meet a minimum threshold.
 *
 * @param results - Array of tracks from Tidal search
 * @param inputArtist - Original artist name to match (lowercase)
 * @param inputTitle - Original title to match (lowercase)
 * @param inputAlbum - Optional album name to match (lowercase) - used as bonus scoring
 * @returns Best matching track with score, or null if no good match
 */
function findBestMatch(
  results: MetadataSourceTrack[],
  inputArtist: string,
  inputTitle: string,
  inputAlbum?: string,
): { track: MetadataSourceTrack; index: number; score: number } | null {
  let bestMatch: { track: MetadataSourceTrack; index: number; score: number } | null = null

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const resultArtist =
      result.artists
        ?.map((a: { title: string }) => a.title)
        .join(", ")
        .toLowerCase() ?? ""
    const resultTitle = result.title.toLowerCase()
    const resultAlbum = result.album?.title?.toLowerCase() ?? ""

    let score = 0

    // Check artist match (lenient - check if either contains the other)
    const artistMatch =
      resultArtist.includes(inputArtist) ||
      inputArtist.includes(resultArtist) ||
      // Also check individual artists for collaborations
      result.artists?.some(
        (a: { title: string }) =>
          a.title.toLowerCase().includes(inputArtist) ||
          inputArtist.includes(a.title.toLowerCase()),
      )
    if (artistMatch) {
      score += 50
    }

    // Check title match (lenient - check if either contains the other)
    const titleMatch = resultTitle.includes(inputTitle) || inputTitle.includes(resultTitle)
    if (titleMatch) {
      score += 50
    }

    // Bonus for exact matches
    if (resultArtist === inputArtist) {
      score += 20
    }
    if (resultTitle === inputTitle) {
      score += 20
    }

    // Album matching bonus (helps pick correct version: single vs album, deluxe, etc.)
    if (inputAlbum && resultAlbum) {
      const albumMatch = resultAlbum.includes(inputAlbum) || inputAlbum.includes(resultAlbum)
      if (albumMatch) {
        score += 30
      }
      // Extra bonus for exact album match
      if (resultAlbum === inputAlbum) {
        score += 20
      }
    }

    // Only consider if we have at least a partial match on both artist and title
    // (score >= 100 means both matched)
    if (score >= 100 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { track: result, index: i, score }
    }
  }

  return bestMatch
}

interface MakeApiParams {
  client: TidalApiClient
  config: MetadataSourceLifecycleCallbacks
  tidalUserId?: string // Tidal user ID for library operations
}

/**
 * Create a MetadataSourceApi implementation for Tidal
 */
export async function makeApi({
  client,
  config,
  tidalUserId,
}: MakeApiParams): Promise<MetadataSourceApi> {
  // Notify that authentication completed
  config.onAuthenticationCompleted?.()

  const api: MetadataSourceApi = {
    /**
     * Search for tracks by query string
     */
    async search(query: string): Promise<MetadataSourceTrack[]> {
      try {
        const response = await searchTracks(client, query)
        const parsed = tidalSearchResponseSchema.safeParse(response)

        if (!parsed.success) {
          console.error("[Tidal API] Failed to parse search response:", parsed.error)
          return []
        }

        return parsed.data.data.map((track: Parameters<typeof transformTidalTrack>[0]) =>
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
     * Search for tracks by structured parameters.
     * Uses smart matching to filter results that don't match the input artist/title.
     * This addresses Tidal's search API sometimes returning irrelevant top results.
     */
    async searchByParams(params: MetadataSourceSearchParameters): Promise<MetadataSourceTrack[]> {
      const { title, artists, album } = params
      const artistNames = artists.map((a: { title: string }) => a.title).join(" ")

      // Build query - don't include album as it can confuse Tidal's search
      const query = `${artistNames} ${title}`.trim()

      // Get raw search results
      const allResults = await this.search(query)

      if (allResults.length === 0) {
        return []
      }

      // Apply matching logic to find the best result
      const inputArtist = artistNames.toLowerCase()
      const inputTitle = title.toLowerCase()
      const inputAlbum = album?.title?.toLowerCase()

      const bestMatch = findBestMatch(allResults, inputArtist, inputTitle, inputAlbum)

      if (bestMatch) {
        // Return the best match followed by other results (in case caller wants alternatives)
        const otherResults = allResults.filter(
          (_: MetadataSourceTrack, idx: number) => idx !== bestMatch.index,
        )
        return [bestMatch.track, ...otherResults]
      }

      // No good match found - return empty to indicate no match
      return []
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

      // Step 1: Create the empty playlist
      const playlist = await createPlaylistApi(
        client,
        tidalUserId,
        params.title,
        `Created from Listening Room on ${new Date().toLocaleDateString()}`,
      )

      // Step 2: Add tracks to the playlist
      if (params.trackIds.length > 0) {
        await addTracksToPlaylist(client, playlist.id, params.trackIds)
      }

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
