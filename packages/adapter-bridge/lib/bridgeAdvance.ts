import type { AppContext, JobApi, JobRegistration, PlaybackControllerApi } from "@repo/types"
import type { BridgeCapabilityCache } from "./capability"

const ADVANCE_THRESHOLD_MS = 1000

function isNearEnd(progressMs: number | null | undefined, durationMs: number | null | undefined) {
  return (
    progressMs != null &&
    durationMs != null &&
    durationMs > 0 &&
    progressMs >= durationMs - ADVANCE_THRESHOLD_MS
  )
}

/**
 * Bridge advance loop: ENDED events from the daemon + 1s probe via composite getPlayback.
 * Job name: bridge-player-{roomId} (cleanupRooms / empty-room pause).
 */
export function createBridgeAdvanceJob(params: {
  context: AppContext
  roomId: string
  userId: string
  playTrack: (mediaUri: string) => Promise<void>
  getPlaybackApi: () => Promise<PlaybackControllerApi | null>
  capability: BridgeCapabilityCache
}): JobRegistration {
  const { context, roomId, playTrack, getPlaybackApi, capability } = params

  let advancing = false
  let lastAdvanceAt = 0

  async function advanceToNext(reason: string) {
    if (advancing) return
    // Debounce double ENDED / probe races that would skip two queue items
    if (Date.now() - lastAdvanceAt < 1500) return
    advancing = true
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
      const { isAppControlledPlayback, isQueueAutoAdvanceEnabled } = await import(
        "@repo/server/lib/roomTypeHelpers"
      )

      const room = await findRoom({ context, roomId })
      if (!room || !isAppControlledPlayback(room) || !isQueueAutoAdvanceEnabled(room)) {
        return
      }

      const existingDispatched = await getDispatchedTrack({ context, roomId })
      // Near-end probe while current dispatch hasn't been acknowledged by NP yet.
      // ENDED / unplayable must still advance (clear stale dispatch first).
      if (existingDispatched && reason !== "ended-event") {
        return
      }
      if (existingDispatched && reason === "ended-event") {
        await clearDispatchedTrack({ context, roomId })
      }

      console.log(`[bridge-advance] advancing (${reason}) for room ${roomId}`)

      const nextItem = await popNextFromQueue({ context, roomId })
      if (!nextItem) {
        console.log(`[bridge-advance] queue empty for room ${roomId}`)
        // Unplayable/ended with nothing next: stop active source so we don't hang
        try {
          const api = await getPlaybackApi()
          await api?.pause?.()
        } catch {
          /* ignore */
        }
        return
      }

      const uri = nextItem.track.urls?.find((u) => u.type === "resource")?.url
      if (!uri) {
        console.error("[bridge-advance] no resource URI for next track")
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
      } catch (e) {
        console.error("[bridge-advance] playTrack failed:", e)
        await clearDispatchedTrack({ context, roomId })
        await addToQueue({ context, roomId, item: nextItem })
        return
      }

      lastAdvanceAt = Date.now()

      if (context.systemEvents) {
        const payload = await buildQueueChangedData({
          context,
          roomId,
          appControlled: true,
        })
        await context.systemEvents.emit(roomId, "QUEUE_CHANGED", payload)
      }
    } finally {
      advancing = false
    }
  }

  capability.onEvent((event) => {
    if (event.type === "ENDED") {
      void advanceToNext("ended-event")
    }
  })

  return {
    name: `bridge-player-${roomId}`,
    description: `Bridge playback advance and state probe for room ${roomId}`,
    cron: "*/1 * * * * *",
    enabled: true,
    runAt: Date.now(),
    handler: async ({ api: _jobApi }: { api: JobApi; context: AppContext }) => {
      try {
        const { findRoom } = await import("@repo/server/operations/data")
        const { isAppControlledPlayback, isQueueAutoAdvanceEnabled } = await import(
          "@repo/server/lib/roomTypeHelpers"
        )
        const { handlePlaybackStateChange } = await import(
          "@repo/server/operations/playback/handlePlaybackStateChange"
        )
        const { handlePlaybackVolumeChange } = await import(
          "@repo/server/operations/playback/handlePlaybackVolumeChange"
        )

        const room = await findRoom({ context, roomId })
        if (!room) return

        // Prefer composite getPlayback (Spotify or active daemon driver).
        // Daemon STATE alone is insufficient: idle YouTube STATE can mask Spotify progress.
        const api = await getPlaybackApi()
        if (api) {
          try {
            const playback = await api.getPlayback()
            await handlePlaybackStateChange({
              context,
              roomId,
              state: playback.state,
              trackId:
                playback.track && typeof playback.track === "object" && "id" in playback.track
                  ? String((playback.track as { id: string }).id)
                  : null,
            })

            if (isAppControlledPlayback(room) && isQueueAutoAdvanceEnabled(room)) {
              if (playback.state === "playing" && isNearEnd(playback.progressMs, playback.durationMs)) {
                await advanceToNext("playback-probe")
                return
              }
            }
          } catch {
            /* daemon/spotify unavailable */
          }
        }

        // Fallback: daemon STATE near-end (YouTube/local/tidal) when getPlayback failed
        const lastState = capability.getLastState()
        if (lastState?.volumePercent != null) {
          await handlePlaybackVolumeChange({
            context,
            roomId,
            volumePercent: lastState.volumePercent,
          })
        }

        if (
          isAppControlledPlayback(room) &&
          isQueueAutoAdvanceEnabled(room) &&
          lastState &&
          (lastState.state === "playing" || lastState.state === "stopped") &&
          isNearEnd(lastState.progressMs, lastState.durationMs)
        ) {
          await advanceToNext(lastState.state === "stopped" ? "state-ended" : "state-probe")
        }
      } catch (e) {
        console.error(`[bridge-player-${roomId}] error:`, e)
      }
    },
  }
}
