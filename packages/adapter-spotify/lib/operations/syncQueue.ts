import { SpotifyApi } from "@spotify/web-api-ts-sdk"

/**
 * Fetches the current queue from Spotify.
 *
 * Returns an array of Spotify track URIs that are currently in the queue.
 * The server will compare these with the app's internal queue and remove
 * any tracks that are no longer present in Spotify's queue.
 */
export async function fetchSpotifyQueue(params: {
  spotifyApi: SpotifyApi
}): Promise<{ trackUris: string[] }> {
  const { spotifyApi } = params

  try {
    const queueData = await spotifyApi.player.getUsersQueue()

    // Extract URIs from the queue (not including currently playing)
    const trackUris = queueData.queue
      .filter((item): item is { uri: string } => "uri" in item)
      .map((item) => item.uri)

    return { trackUris }
  } catch (error: any) {
    // If we can't fetch the queue, return empty array
    // This will cause no sync to happen (we don't want to remove tracks on error)
    console.error("Error fetching Spotify queue:", error?.message || error)
    throw error
  }
}
