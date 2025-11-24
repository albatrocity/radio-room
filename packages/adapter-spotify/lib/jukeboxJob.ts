import { AppContext, JobRegistration, SimpleCache } from "@repo/types"
import { SpotifyApi } from "@spotify/web-api-ts-sdk"
import { trackItemSchema } from "./schemas"

export function createJukeboxPollingJob(params: {
  context: AppContext
  roomId: string
  userId: string
  onTrackChange: (track: any) => void
}): JobRegistration {
  const { context, roomId, userId, onTrackChange } = params

  return {
    name: `spotify-jukebox-${roomId}`,
    description: `Polls Spotify currently playing track for room ${roomId}`,
    cron: "*/5 * * * * *", // Every 5 seconds
    enabled: true,
    runAt: Date.now(),
    handler: async ({ cache }: { cache: SimpleCache }) => {
      try {
        // Get user's Spotify credentials
        if (!context.data?.getUserServiceAuth) {
          console.error("getUserServiceAuth not available in context")
          return
        }

        const auth = await context.data.getUserServiceAuth({
          userId,
          serviceName: "spotify",
        })

        if (!auth) {
          console.error(`No Spotify auth found for user ${userId}`)
          return
        }

        const clientId = process.env.SPOTIFY_CLIENT_ID
        if (!clientId) {
          throw new Error("SPOTIFY_CLIENT_ID not configured")
        }

        // Create Spotify API client
        const spotifyApi = SpotifyApi.withAccessToken(clientId, {
          access_token: auth.accessToken,
          refresh_token: auth.refreshToken,
          token_type: "Bearer",
          expires_in: 3600,
        })

        // Get currently playing track
        const nowPlaying = await spotifyApi.player.getCurrentlyPlayingTrack()

        if (nowPlaying?.item && "id" in nowPlaying.item) {
          const currentTrackId = nowPlaying.item.id

          // Get last known track from cache
          const cacheKey = `room:${roomId}:lastTrack`
          const lastTrackId = await cache.get(cacheKey)

          // If track changed, notify and update cache
          if (lastTrackId !== currentTrackId) {
            const track = trackItemSchema.parse(nowPlaying.item)
            onTrackChange(track)
            await cache.set(cacheKey, currentTrackId)
          }
        }
      } catch (error: any) {
        // Handle rate limiting
        if (error.status === 429) {
          console.warn(`Spotify rate limited for room ${roomId}`)
          // Could implement backoff here
        } else {
          console.error(`Error polling Spotify for room ${roomId}:`, error)
        }
      }
    },
  }
}
