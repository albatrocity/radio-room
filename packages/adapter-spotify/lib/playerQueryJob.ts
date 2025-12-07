import { AppContext, JobRegistration, JobApi } from "@repo/types"
import { SpotifyApi } from "@spotify/web-api-ts-sdk"
import { trackItemSchema } from "./schemas"
import { fetchSpotifyQueue } from "./operations/syncQueue"

// Throttle queue sync to once per 60 seconds
const QUEUE_SYNC_INTERVAL_MS = 60 * 1000
const lastQueueSyncTime: Map<string, number> = new Map()

/**
 * Creates a polling job that fetches currently playing track from Spotify.
 *
 * This job:
 * 1. Polls Spotify API for currently playing track
 * 2. Submits track data to server via JobApi
 * 3. Periodically syncs the Spotify queue with the app's queue (every 60 seconds)
 *
 * The server handles:
 * - Track deduplication (is this a new track?)
 * - QueueItem construction
 * - Redis persistence
 * - Playlist/queue management
 * - Event emission (TRACK_CHANGED, MEDIA_SOURCE_STATUS_CHANGED, QUEUE_CHANGED)
 */
export function createPlayerQueryJob(params: {
  context: AppContext
  roomId: string
  userId: string
}): JobRegistration {
  const { context, roomId, userId } = params

  return {
    name: `spotify-player-${roomId}`,
    description: `Polls Spotify currently playing track for room ${roomId}`,
    cron: "*/5 * * * * *", // Every 5 seconds
    enabled: true,
    runAt: Date.now(),
    handler: async ({ api }: { api: JobApi; context: AppContext }) => {
      try {
        // Get user's Spotify credentials
        if (!context.data?.getUserServiceAuth) {
          console.error("getUserServiceAuth not available in context")
          await api.submitMediaData({
            roomId,
            error: "Service auth not available",
          })
          return
        }

        const auth = await context.data.getUserServiceAuth({
          userId,
          serviceName: "spotify",
        })

        if (!auth) {
          // No auth - media source is offline
          await api.submitMediaData({ roomId })
          return
        }

        const clientId = process.env.SPOTIFY_CLIENT_ID
        if (!clientId) {
          await api.submitMediaData({
            roomId,
            error: "SPOTIFY_CLIENT_ID not configured",
          })
          return
        }

        // Create Spotify API client
        const spotifyApi = SpotifyApi.withAccessToken(clientId, {
          access_token: auth.accessToken,
          refresh_token: auth.refreshToken,
          token_type: "Bearer",
          expires_in: 3600,
        })

        // Fetch currently playing track from Spotify
        const nowPlaying = await spotifyApi.player.getCurrentlyPlayingTrack()

        if (nowPlaying?.item && "id" in nowPlaying.item) {
          // Parse track data using our schema
          const track = trackItemSchema.parse(nowPlaying.item)

          // Submit to server - Spotify provides enriched data (it's both MediaSource and MetadataSource)
          await api.submitMediaData({
            roomId,
            submission: {
              trackId: track.id,
              sourceType: "spotify",
              title: track.title,
              artist: track.artists?.map((a) => a.title).join(", "),
              album: track.album?.title,
              // Pre-enriched track data - no server-side enrichment needed
              enrichedTrack: track,
              metadataSource: {
                type: "spotify",
                trackId: track.id,
              },
            },
          })
        } else {
          // No track playing - notify server
          await api.submitMediaData({ roomId })
        }

        // Sync queue periodically (throttled to once per 60 seconds)
        const lastSync = lastQueueSyncTime.get(roomId) ?? 0
        const now = Date.now()
        if (now - lastSync >= QUEUE_SYNC_INTERVAL_MS) {
          try {
            const { trackUris } = await fetchSpotifyQueue({ spotifyApi })
            const result = await api.submitQueueSync({
              roomId,
              mediaSourceTrackUris: trackUris,
            })
            if (result.changed) {
              console.log(
                `[Queue Sync] Room ${roomId}: Removed ${result.removedCount} tracks no longer in Spotify queue`,
              )
            }
            lastQueueSyncTime.set(roomId, now)
          } catch (queueError: any) {
            // Don't fail the whole job if queue sync fails
            console.warn(
              `[Queue Sync] Failed for room ${roomId}:`,
              queueError?.message || queueError,
            )
          }
        }
      } catch (error: any) {
        // Handle rate limiting
        if (error.status === 429) {
          console.warn(`Spotify rate limited for room ${roomId}`)
          // Don't change status for rate limiting - it's temporary
        } else {
          console.error(`Error polling Spotify for room ${roomId}:`, error)
          await api.submitMediaData({
            roomId,
            error: error.message,
          })
        }
      }
    },
  }
}
