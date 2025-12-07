import { AdapterConfig, MetadataSourceAdapterConfig } from "@repo/types"
import { refreshTidalAccessToken } from "./operations/refreshTidalAccessToken"

type TidalApiConfig = MetadataSourceAdapterConfig | AdapterConfig

const TIDAL_API_BASE = "https://openapi.tidal.com/v2"

export interface TidalApiClient {
  accessToken: string
  refreshToken?: string
  clientId: string
  countryCode: string
  // Callback to update stored tokens after refresh
  onTokenRefresh?: (accessToken: string, refreshToken: string) => Promise<void>
}

/**
 * Get Tidal API client with stored tokens
 */
export async function getTidalApi(config: TidalApiConfig): Promise<TidalApiClient> {
  const { type } = config.authentication
  if (type !== "token" && type !== "oauth") {
    throw new Error("Invalid authentication type")
  }

  const { getStoredTokens, clientId } = config.authentication

  try {
    const { accessToken, refreshToken } = await getStoredTokens()
    if (!accessToken) {
      throw new Error("No access token provided for Tidal")
    }

    return {
      accessToken,
      refreshToken,
      clientId,
      countryCode: "US", // Default country code, could be made configurable
    }
  } catch (error) {
    throw new Error("Failed to get stored tokens for Tidal")
  }
}

/**
 * Make an authenticated request to the Tidal API
 * Automatically refreshes token on 401 errors if refresh token is available
 */
export async function tidalFetch<T>(
  client: TidalApiClient,
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = endpoint.startsWith("http") ? endpoint : `${TIDAL_API_BASE}${endpoint}`

  const makeRequest = async (accessToken: string) => {
    const headers: HeadersInit = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/vnd.api+json",
      Accept: "application/vnd.api+json",
      ...options.headers,
    }

    return fetch(url, {
      ...options,
      headers,
    })
  }

  let response = await makeRequest(client.accessToken)

  // If 401, try to refresh the token
  if (response.status === 401 && client.refreshToken) {
    console.log("[Tidal API] Token expired, attempting refresh...")

    const clientSecret = process.env.TIDAL_CLIENT_SECRET
    if (!clientSecret) {
      throw new Error("TIDAL_CLIENT_SECRET not configured for token refresh")
    }

    try {
      const refreshed = await refreshTidalAccessToken(
        client.refreshToken,
        client.clientId,
        clientSecret,
      )

      console.log("[Tidal API] Token refreshed successfully")

      // Update the client with new token
      client.accessToken = refreshed.accessToken
      if (refreshed.refreshToken) {
        client.refreshToken = refreshed.refreshToken
      }

      // Notify about token refresh if callback provided
      if (client.onTokenRefresh) {
        await client.onTokenRefresh(refreshed.accessToken, refreshed.refreshToken)
      }

      // Retry the request with new token
      response = await makeRequest(refreshed.accessToken)
    } catch (refreshError) {
      console.error("[Tidal API] Token refresh failed:", refreshError)
      throw new Error(`Tidal API error: 401 Unauthorized - Token refresh failed`)
    }
  }

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Tidal API error: ${response.status} ${response.statusText} - ${errorBody}`)
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T
  }

  return response.json()
}

/**
 * Search for tracks using Tidal's searchSuggestions API
 *
 * This endpoint works better for combined "artist + track" searches.
 * Reference: https://tidal-music.github.io/tidal-api-reference/#/searchSuggestions
 */
export async function searchTracks(
  client: TidalApiClient,
  query: string,
  limit = 10,
): Promise<unknown> {
  console.log(`[Tidal Search] Searching for: "${query}"`)

  // Try searchSuggestions with directHits relationship
  try {
    const encodedQuery = encodeURIComponent(query)
    console.log(`[Tidal Search] Trying directHits for: "${query}"`)

    // Directly fetch the directHits relationship which returns actual tracks
    const directHitsResponse = await tidalFetch<{
      data?: Array<{ id: string; type: string }>
      included?: Array<{ id: string; type: string }>
    }>(
      client,
      `/searchSuggestions/${encodedQuery}/relationships/directHits?countryCode=${client.countryCode}&include=tracks`,
    )

    console.log(`[Tidal Search] directHits response keys:`, Object.keys(directHitsResponse))

    // Get track IDs from directHits
    let trackIds: string[] = []

    if (Array.isArray(directHitsResponse.data)) {
      const tracks = directHitsResponse.data.filter((item) => item.type === "tracks")
      if (tracks.length > 0) {
        console.log(`[Tidal Search] ✓ Found ${tracks.length} tracks in directHits`)
        trackIds = tracks.slice(0, limit).map((t) => t.id)
      }
    }

    // Also check included
    if (trackIds.length === 0 && Array.isArray(directHitsResponse.included)) {
      const tracks = directHitsResponse.included.filter((item) => item.type === "tracks")
      if (tracks.length > 0) {
        console.log(`[Tidal Search] ✓ Found ${tracks.length} tracks in included`)
        trackIds = tracks.slice(0, limit).map((t) => t.id)
      }
    }

    if (trackIds.length > 0) {
      console.log(`[Tidal Search] Fetching full details for tracks: ${trackIds.join(",")}`)

      // Use getTracks to also fetch album cover art
      const tracksResponse = await getTracks(client, trackIds)

      console.log(`[Tidal Search] Got full track details`)
      return tracksResponse
    }

    console.log(`[Tidal Search] ✗ No directHits for: "${query}"`)
  } catch (error) {
    console.log(`[Tidal Search] directHits failed:`, (error as Error).message)
  }

  // Fallback: try searchResults with just the track title
  const parts = query.split(" ")
  const queriesToTry =
    parts.length > 2 ? [parts.slice(-2).join(" "), parts.slice(-3).join(" ")] : [query]

  for (const searchQuery of queriesToTry) {
    const encodedQuery = encodeURIComponent(searchQuery)

    try {
      console.log(`[Tidal Search] Fallback trying: "${searchQuery}"`)

      const searchResponse = await tidalFetch<{ data?: Array<{ id: string; type: string }> }>(
        client,
        `/searchResults/${encodedQuery}/relationships/tracks?countryCode=${client.countryCode}&page[limit]=${limit}`,
      )

      const trackRefs = searchResponse?.data
      if (!trackRefs || trackRefs.length === 0) {
        console.log(`[Tidal Search] ✗ No results for: "${searchQuery}"`)
        continue
      }

      console.log(`[Tidal Search] ✓ Found ${trackRefs.length} track refs`)

      const trackIdList = trackRefs.slice(0, 5).map((t) => t.id)
      // Use getTracks to also fetch album cover art
      const tracksResponse = await getTracks(client, trackIdList)

      return tracksResponse
    } catch (error) {
      console.log(`[Tidal Search] ✗ Fallback error for "${searchQuery}":`, (error as Error).message)
    }
  }

  console.log(`[Tidal Search] No results found`)
  return { data: [], included: [] }
}

/**
 * Get a single track by ID
 */
export async function getTrack(client: TidalApiClient, trackId: string): Promise<unknown> {
  const response = await tidalFetch<unknown>(
    client,
    `/tracks/${trackId}?countryCode=${client.countryCode}&include=artists,albums`,
  )

  return response
}

/**
 * Get multiple tracks by IDs
 */
export async function getTracks(client: TidalApiClient, trackIds: string[]): Promise<unknown> {
  const ids = trackIds.join(",")
  // First get tracks with artists and albums
  const response = await tidalFetch<{
    data: Array<{ id: string; relationships?: { albums?: { data?: Array<{ id: string }> } } }>
    included?: Array<{ id: string; type?: string; attributes?: Record<string, unknown> }>
  }>(client, `/tracks?filter[id]=${ids}&countryCode=${client.countryCode}&include=artists,albums`)

  // Extract unique album IDs to fetch their images
  const albumIds = new Set<string>()
  console.log(`[Tidal API] Extracting album IDs from ${response.data?.length ?? 0} tracks`)
  for (const track of response.data ?? []) {
    console.log(
      `[Tidal API] Track ${track.id} relationships:`,
      Object.keys((track as any).relationships ?? {}),
    )
    const albumId = track.relationships?.albums?.data?.[0]?.id
    if (albumId) {
      albumIds.add(albumId)
      console.log(`[Tidal API] Found album ID: ${albumId}`)
    }
  }

  // Fetch album images if we have albums
  console.log(`[Tidal API] Album IDs to fetch images for:`, Array.from(albumIds))
  if (albumIds.size > 0) {
    try {
      const albumIdsStr = Array.from(albumIds).join(",")
      console.log(`[Tidal API] Fetching coverArt for albums: ${albumIdsStr}`)
      const albumsWithImages = await tidalFetch<{
        data: Array<{ id: string; relationships?: { coverArt?: { data?: Array<{ id: string }> } } }>
        included?: Array<{
          id: string
          type?: string
          attributes?: { url?: string; width?: number; height?: number }
        }>
      }>(
        client,
        `/albums?filter[id]=${albumIdsStr}&countryCode=${client.countryCode}&include=coverArt`,
      )
      console.log(`[Tidal API] coverArt response data length:`, albumsWithImages.data?.length)
      console.log(
        `[Tidal API] coverArt response included length:`,
        albumsWithImages.included?.length,
      )

      // Merge image data into the included array
      if (albumsWithImages.included?.length) {
        response.included = response.included ?? []
        // Add image resources to included
        console.log(
          `[Tidal API] Album images included types:`,
          Array.from(new Set(albumsWithImages.included.map((i) => i.type).filter(Boolean))),
        )
        for (const imageResource of albumsWithImages.included) {
          if (
            imageResource.type === "imageResources" ||
            imageResource.type === "images" ||
            imageResource.type === "artworks" ||
            imageResource.attributes?.url
          ) {
            response.included.push(imageResource as any)
          }
        }

        // Update album data with coverArt relationship
        for (const albumWithImages of albumsWithImages.data ?? []) {
          const existingAlbum = response.included.find(
            (item) => item.type === "albums" && item.id === albumWithImages.id,
          )
          if (existingAlbum && albumWithImages.relationships?.coverArt) {
            ;(existingAlbum as any).relationships = {
              ...(existingAlbum as any).relationships,
              coverArt: albumWithImages.relationships.coverArt,
            }
            console.log(
              `[Tidal API] Added coverArt to album ${albumWithImages.id}:`,
              albumWithImages.relationships.coverArt.data?.length,
              "images",
            )
          }
        }
      }

      console.log(`[Tidal API] Fetched images for ${albumIds.size} albums`)
    } catch (err) {
      console.log(`[Tidal API] Failed to fetch album images:`, err)
      // Continue without images
    }
  }

  return response
}

/**
 * Get user's collection (saved tracks)
 * Requires collection.read scope
 */
export async function getUserCollection(client: TidalApiClient, userId: string): Promise<unknown> {
  const response = await tidalFetch<unknown>(
    client,
    `/userCollections/${userId}/relationships/tracks?countryCode=${client.countryCode}&include=artists,albums`,
  )

  return response
}

/**
 * Add tracks to user's collection
 * Requires collection.write scope
 */
export async function addToUserCollection(
  client: TidalApiClient,
  userId: string,
  trackIds: string[],
): Promise<void> {
  await tidalFetch<void>(client, `/userCollections/${userId}/relationships/tracks`, {
    method: "POST",
    body: JSON.stringify({
      data: trackIds.map((id) => ({ type: "tracks", id })),
    }),
  })
}

/**
 * Remove tracks from user's collection
 * Requires collection.write scope
 */
export async function removeFromUserCollection(
  client: TidalApiClient,
  userId: string,
  trackIds: string[],
): Promise<void> {
  await tidalFetch<void>(client, `/userCollections/${userId}/relationships/tracks`, {
    method: "DELETE",
    body: JSON.stringify({
      data: trackIds.map((id) => ({ type: "tracks", id })),
    }),
  })
}

/**
 * Check if tracks are in user's collection
 * Note: Tidal API may not have a direct "check saved" endpoint like Spotify
 * This implementation fetches the collection and checks locally
 */
export async function checkSavedTracks(
  client: TidalApiClient,
  userId: string,
  trackIds: string[],
): Promise<boolean[]> {
  try {
    const collection = (await getUserCollection(client, userId)) as {
      data?: Array<{ id: string }>
    }
    const savedIds = new Set(collection.data?.map((item) => item.id) ?? [])
    return trackIds.map((id) => savedIds.has(id))
  } catch (error) {
    // If we can't access the collection, assume nothing is saved
    console.error("Error checking saved tracks:", error)
    return trackIds.map(() => false)
  }
}
