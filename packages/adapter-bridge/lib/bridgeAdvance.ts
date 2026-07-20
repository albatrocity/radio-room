import type { AppContext, JobApi, JobRegistration, PlaybackControllerApi, QueueItem } from "@repo/types"
import { lastEndedKey } from "./protocol"
import type { BridgeCapabilityCache } from "./capability"

const ADVANCE_THRESHOLD_MS = 1000
/** Consecutive no-media polls before treating as unplayable (backup if ENDED key missed). */
const STUCK_NO_MEDIA_POLLS = 8

function isNearEnd(progressMs: number | null | undefined, durationMs: number | null | undefined) {
  return (
    progressMs != null &&
    durationMs != null &&
    durationMs > 0 &&
    progressMs >= durationMs - ADVANCE_THRESHOLD_MS
  )
}

function isForceAdvanceReason(reason: string) {
  return reason === "ended-event" || reason === "stuck-stopped"
}

function hasPlayableMedia(playback: {
  progressMs?: number | null
  durationMs?: number | null
}) {
  return (
    playback.durationMs != null &&
    playback.durationMs > 0 &&
    playback.progressMs != null &&
    playback.progressMs >= 0
  )
}

/** Natural finishes must not chat-notify; error/watchdog/stuck should. */
function isUnplayableEndedReason(endedReason: string | undefined | null) {
  if (!endedReason || endedReason === "natural") return false
  return true
}

function shouldAnnounceCannotPlay(advanceReason: string, endedReason?: string | null) {
  if (advanceReason === "stuck-stopped") return true
  if (advanceReason === "ended-event") return isUnplayableEndedReason(endedReason)
  return false
}

function formatTrackLabel(item: QueueItem) {
  const title = item.track.title ?? "Unknown track"
  const artist = item.track.artists?.[0]?.title
  return artist ? `${title} by ${artist}` : title
}

/**
 * Bridge advance loop: ENDED via Redis key + pub/sub, plus getPlayback probe.
 * Job name: bridge-player-{roomId} (cleanupRooms / empty-room pause).
 */
export function createBridgeAdvanceJob(params: {
  context: AppContext
  roomId: string
  userId: string
  playTrack: (mediaUri: string) => Promise<void>
  getPlaybackApi: () => Promise<PlaybackControllerApi | null>
  capability: BridgeCapabilityCache
  /** Clear Redis active source when the queue idles so Play starts the next item cleanly. */
  clearActiveSource?: () => Promise<void>
}): JobRegistration {
  const { context, roomId, playTrack, getPlaybackApi, capability, clearActiveSource } = params

  let advancing = false
  let lastAdvanceAt = 0
  let stuckNoMediaPolls = 0

  async function announceCannotPlay(
    item: QueueItem | null | undefined,
    options?: { skipping?: boolean },
  ) {
    if (!item || !context.systemEvents) return
    try {
      const { default: systemMessage } = await import("@repo/server/lib/systemMessage")
      const { persistMessage } = await import("@repo/server/operations/data")
      const base = `Couldn't play ${formatTrackLabel(item)}`
      const content = options?.skipping ? `${base} — skipping to the next track` : base
      const message = systemMessage(content, { type: "alert", status: "warning" })
      await context.systemEvents.emit(roomId, "MESSAGE_RECEIVED", {
        roomId,
        message,
      })
      await persistMessage({ roomId, message, context })
    } catch (e) {
      console.error("[bridge-advance] failed to announce unplayable track:", e)
    }
  }

  async function advanceToNext(reason: string, endedReason?: string | null) {
    if (advancing) return
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
      if (existingDispatched && !isForceAdvanceReason(reason)) {
        return
      }

      if (shouldAnnounceCannotPlay(reason, endedReason)) {
        await announceCannotPlay(existingDispatched, { skipping: true })
      }

      if (existingDispatched && isForceAdvanceReason(reason)) {
        await clearDispatchedTrack({ context, roomId })
      }

      console.log(
        `[bridge-advance] advancing (${reason}${endedReason ? `/${endedReason}` : ""}) for room ${roomId}`,
      )

      const nextItem = await popNextFromQueue({ context, roomId })
      if (!nextItem) {
        console.log(`[bridge-advance] queue empty for room ${roomId}`)
        stuckNoMediaPolls = 0
        try {
          const api = await getPlaybackApi()
          await api?.pause?.()
        } catch {
          /* ignore */
        }
        try {
          await clearActiveSource?.()
        } catch {
          /* ignore */
        }
        return
      }

      const uri = nextItem.track.urls?.find((u) => u.type === "resource")?.url
      if (!uri) {
        console.error("[bridge-advance] no resource URI for next track")
        await announceCannotPlay(nextItem)
        await addToQueue({ context, roomId, item: nextItem })
        return
      }

      await setDispatchedTrack({ context, roomId, item: nextItem })
      stuckNoMediaPolls = 0

      await context.pluginRegistry?.runBeforePlayQueuedTrack({
        roomId,
        item: nextItem,
        reason: "auto-advance",
      })

      try {
        await playTrack(uri)
      } catch (e) {
        console.error("[bridge-advance] playTrack failed:", e)
        await announceCannotPlay(nextItem)
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
      void advanceToNext("ended-event", event.reason)
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
        const { findRoom, getDispatchedTrack, getQueue } = await import(
          "@repo/server/operations/data"
        )
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
        if (!isAppControlledPlayback(room) || !isQueueAutoAdvanceEnabled(room)) {
          return
        }

        // 1) Durable ENDED key (written by daemon) — does not depend on pub/sub
        const endedRaw = await context.redis.pubClient.get(lastEndedKey(roomId))
        if (endedRaw) {
          await context.redis.pubClient.del(lastEndedKey(roomId))
          console.log(`[bridge-advance] consumed last_ended key: ${endedRaw}`)
          let endedReason: string | undefined
          try {
            const parsed = JSON.parse(endedRaw) as { reason?: string }
            endedReason = parsed.reason
          } catch {
            /* legacy plain payloads */
          }
          await advanceToNext("ended-event", endedReason)
          return
        }

        // 2) In-memory ENDED from pub/sub (if subscription works)
        const ended = capability.consumeLastEnded()
        if (ended) {
          await advanceToNext("ended-event", ended.reason)
          return
        }

        const api = await getPlaybackApi()
        if (!api) return

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

          if (playback.state === "playing" && isNearEnd(playback.progressMs, playback.durationMs)) {
            await advanceToNext("playback-probe")
            return
          }

          // Unplayable / never-started: no duration yet while we still expect a track.
          // Counts for stopped OR "playing"/buffering with no media (YT unavailable UI).
          const dispatched = await getDispatchedTrack({ context, roomId })
          const queue = await getQueue({ context, roomId })
          const expectingPlayback = !!dispatched || queue.some((i) => !i.locked)

          if (expectingPlayback && !hasPlayableMedia(playback)) {
            stuckNoMediaPolls += 1
            if (stuckNoMediaPolls >= STUCK_NO_MEDIA_POLLS) {
              console.warn(
                `[bridge-advance] stuck no-media (${stuckNoMediaPolls}s, state=${playback.state}) — skipping`,
              )
              await advanceToNext("stuck-stopped")
              return
            }
          } else if (hasPlayableMedia(playback) && playback.state === "playing") {
            stuckNoMediaPolls = 0
          }
        } catch {
          /* daemon/spotify unavailable */
        }

        const lastState = capability.getLastState()
        if (lastState?.volumePercent != null) {
          await handlePlaybackVolumeChange({
            context,
            roomId,
            volumePercent: lastState.volumePercent,
          })
        }

        if (
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
