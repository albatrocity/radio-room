import { AppContext, JobRegistration, JobApi } from "@repo/types"
import { SpotifyApi } from "@spotify/web-api-ts-sdk"
import type { TrackItem } from "@spotify/web-api-ts-sdk"

/** Fire early enough that polling jitter + API latency still lands before track end. */
export const ADVANCE_THRESHOLD_MS = 5000

function trackDurationMs(item: TrackItem): number | undefined {
  if (item && typeof item === "object" && "duration_ms" in item) {
    const d = (item as { duration_ms?: number }).duration_ms
    return typeof d === "number" ? d : undefined
  }
  return undefined
}

function resourceUriFromQueueItem(item: {
  track: { urls?: Array<{ type: string; url: string }> }
}): string | undefined {
  return item.track.urls?.find((u) => u.type === "resource")?.url
}

/**
 * App-controlled playback: when the current Spotify track is near its end,
 * pop the next item from the app's ordered queue and start it via Web API.
 *
 * Shoutcast/metadata detection remains authoritative for Now Playing UI.
 */
export function createTrackAdvanceJob(params: {
  context: AppContext
  roomId: string
  userId: string
}): JobRegistration {
  const { context, roomId, userId } = params

  return {
    name: `track-advance-${roomId}`,
    description: `App-controlled Spotify playback advance for room ${roomId}`,
    cron: "*/3 * * * * *",
    enabled: true,
    runAt: Date.now(),
    handler: async ({ api: _jobApi }: { api: JobApi; context: AppContext }) => {
      try {
        const { findRoom } = await import("@repo/server/operations/data")
        const {
          popNextFromQueue,
          getDispatchedTrack,
          setDispatchedTrack,
          getQueue,
        } = await import("@repo/server/operations/data")
        const { isAppControlledPlayback } = await import("@repo/server/lib/roomTypeHelpers")

        const room = await findRoom({ context, roomId })
        if (!isAppControlledPlayback(room)) {
          return
        }

        if (!context.data?.getUserServiceAuth) {
          return
        }

        const auth = await context.data.getUserServiceAuth({
          userId,
          serviceName: "spotify",
        })
        if (!auth) {
          return
        }

        const clientId = process.env.SPOTIFY_CLIENT_ID
        if (!clientId) {
          return
        }

        const spotifyApi = SpotifyApi.withAccessToken(clientId, {
          access_token: auth.accessToken,
          refresh_token: auth.refreshToken,
          token_type: "Bearer",
          expires_in: 3600,
        })

        const playback = await spotifyApi.player.getPlaybackState()
        if (!playback?.item || !playback.is_playing) {
          return
        }

        const durationMs = trackDurationMs(playback.item as TrackItem)
        const progressMs = playback.progress_ms ?? 0
        if (durationMs == null || durationMs <= 0) {
          return
        }

        if (progressMs < durationMs - ADVANCE_THRESHOLD_MS) {
          return
        }

        const existingDispatched = await getDispatchedTrack({ context, roomId })
        if (existingDispatched) {
          return
        }

        const nextItem = await popNextFromQueue({ context, roomId })
        if (!nextItem) {
          return
        }

        const uri = resourceUriFromQueueItem(nextItem)
        if (!uri) {
          console.warn(`[TrackAdvance] No resource URI for room ${roomId}, skipped`)
          return
        }

        await setDispatchedTrack({ context, roomId, item: nextItem })

        const updatedQueue = await getQueue({ context, roomId })

        if (context.systemEvents) {
          await context.systemEvents.emit(roomId, "QUEUE_CHANGED", {
            roomId,
            queue: updatedQueue,
          })
          await context.systemEvents.emit(roomId, "TRACK_DISPATCHED", {
            roomId,
            track: nextItem,
            queue: updatedQueue,
          })
        }

        const deviceId = playback.device?.id
        if (!deviceId) {
          console.warn(`[TrackAdvance] No active device id for room ${roomId}`)
          return
        }

        try {
          await spotifyApi.player.startResumePlayback(deviceId, undefined, [uri], undefined, 0)
        } catch (error: unknown) {
          const err = error as { message?: string }
          if (
            err.message?.includes("JSON") ||
            err.message?.includes("Unexpected") ||
            err.message?.includes("204")
          ) {
            // Spotify returns empty body on success sometimes
          } else {
            console.error(`[TrackAdvance] startResumePlayback failed room ${roomId}:`, error)
          }
        }
      } catch (error: unknown) {
        const err = error as { status?: number; message?: string }
        if (err.status === 429) {
          console.warn(`[TrackAdvance] Rate limited for room ${roomId}`)
        } else {
          console.error(`[TrackAdvance] Error for room ${roomId}:`, err?.message || error)
        }
      }
    },
  }
}
