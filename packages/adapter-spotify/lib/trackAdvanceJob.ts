import { AppContext, JobRegistration, JobApi } from "@repo/types"
import { SpotifyApi } from "@spotify/web-api-ts-sdk"
import type { TrackItem } from "@spotify/web-api-ts-sdk"

/**
 * Advance only when this much (or less) of the track remains.
 * A larger window caused the first poll inside "last N ms" to skip immediately,
 * cutting off the end of songs. One second preserves the outro while still
 * leaving time for Web API play before Spotify auto-advances or stops.
 */
export const ADVANCE_THRESHOLD_MS = 1000

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
 * Spotify playback job with two responsibilities:
 *
 * 1. **State probe** (all Spotify rooms): Detect external play/pause changes
 *    (e.g., user pauses on their phone) and emit SYSTEM:PLAYBACK_STATE_CHANGED.
 *    This enables pause-aware plugins like Queue Pacer.
 *
 * 2. **Track advance** (app-controlled rooms only): When the current track is
 *    near its end, pop the next item from the queue and start it via Web API.
 *
 * Shoutcast/metadata detection remains authoritative for Now Playing UI.
 */
export function createTrackAdvanceJob(params: {
  context: AppContext
  roomId: string
  userId: string
  /** Resolved PlaybackController API — keeps Spotify Web API calls inside the adapter. */
  playTrack: (mediaUri: string) => Promise<void>
}): JobRegistration {
  const { context, roomId, userId, playTrack } = params

  return {
    name: `track-advance-${roomId}`,
    description: `Spotify state probe and app-controlled playback advance for room ${roomId}`,
    cron: "*/1 * * * * *", // Match narrow end window (1s); 3s polls often missed the final second
    enabled: true,
    runAt: Date.now(),
    handler: async ({ api: _jobApi }: { api: JobApi; context: AppContext }) => {
      try {
        const { findRoom } = await import("@repo/server/operations/data")
        const {
          addToQueue,
          buildQueueChangedData,
          clearDispatchedTrack,
          popNextFromQueue,
          getDispatchedTrack,
          setDispatchedTrack,
        } = await import("@repo/server/operations/data")
        const { isAppControlledPlayback, isQueueAutoAdvanceEnabled } = await import("@repo/server/lib/roomTypeHelpers")
        const {
          handlePlaybackStateChange,
          playbackStateFromIsPlaying,
        } = await import("@repo/server/operations/playback/handlePlaybackStateChange")

        const room = await findRoom({ context, roomId })
        if (!room) {
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
        if (!playback) {
          return
        }

        // =====================================================================
        // State probe: detect external play/pause and emit PLAYBACK_STATE_CHANGED
        // Runs for ALL rooms with a Spotify PlaybackController
        // =====================================================================
        const isPlaying = playback.is_playing === true
        const trackId =
          playback.item && "id" in playback.item ? (playback.item.id as string) : null

        await handlePlaybackStateChange({
          context,
          roomId,
          state: playbackStateFromIsPlaying(isPlaying),
          trackId,
        })

        // =====================================================================
        // Track advance: only for app-controlled playback rooms
        // =====================================================================
        if (!isAppControlledPlayback(room)) {
          return
        }

        if (!isQueueAutoAdvanceEnabled(room)) {
          return
        }

        if (!playback.item || !isPlaying) {
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
          console.warn(`[TrackAdvance] No resource URI for room ${roomId}, restoring queue entry`)
          await addToQueue({ context, roomId, item: nextItem })
          return
        }

        await setDispatchedTrack({ context, roomId, item: nextItem })

        await context.pluginRegistry?.runBeforePlayQueuedTrack({
          roomId,
          item: nextItem,
          reason: "auto-advance",
        })

        try {
          await playTrack(uri)
        } catch (error: unknown) {
          console.error(`[TrackAdvance] playTrack failed room ${roomId}:`, error)
          await clearDispatchedTrack({ context, roomId })
          await addToQueue({ context, roomId, item: nextItem })
          return
        }

        const updatedQueue = await buildQueueChangedData({
          roomId,
          context,
          appControlled: true,
        })

        if (context.systemEvents) {
          await context.systemEvents.emit(roomId, "QUEUE_CHANGED", updatedQueue)
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
