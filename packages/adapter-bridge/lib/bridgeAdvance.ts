import type { AppContext, JobApi, JobRegistration, PlaybackControllerApi, QueueItem } from "@repo/types"
import { lastEndedKey } from "./protocol"
import type { BridgeCapabilityCache } from "./capability"
import {
  endedSourceMatchesActive,
  endedTrackMatchesCurrent,
  isApproachingEnd,
  isNaturalFinish,
  lastStateShouldAdvance,
} from "./playbackFinish"

/** Consecutive no-media polls before treating as unplayable (backup if ENDED key missed). */
const STUCK_NO_MEDIA_POLLS = 8

/** Steady-state getPlayback interval when playback looks healthy. */
const HEALTHY_PROBE_INTERVAL_MS = 3000
/** Near end of track (or stuck/no-media watchdog) — tighten probes. */
const NEAR_END_PROBE_INTERVAL_MS = 1000
/** Initial backoff after an RPC failure; doubles up to MAX_PROBE_BACKOFF_MS. */
const INITIAL_PROBE_BACKOFF_MS = 2000
const MAX_PROBE_BACKOFF_MS = 30_000

function isForceAdvanceReason(reason: string) {
  return reason === "ended-event" || reason === "stuck-stopped" || reason === "state-ended"
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
 *
 * Cron stays 1s so ENDED key/pubsub and near-end checks stay responsive;
 * getPlayback RPC runs at a softer cadence when healthy (with backoff on failure).
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
  /** Current bridge source (`spotify` / `local` / …) so stale pulses from the previous driver are ignored. */
  getActiveSource?: () => Promise<string | null>
}): JobRegistration {
  const {
    context,
    roomId,
    playTrack,
    getPlaybackApi,
    capability,
    clearActiveSource,
    getActiveSource,
  } = params

  let advancing = false
  let lastAdvanceAt = 0
  let stuckNoMediaPolls = 0
  let lastProbeAt = 0
  let probeIntervalMs = HEALTHY_PROBE_INTERVAL_MS
  let rpcFailureCount = 0
  let lastKnownProgressMs: number | null = null
  let lastKnownDurationMs: number | null = null
  let lastKnownTrackId: string | null = null

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

  async function resolveCurrentTrackId(): Promise<string | null> {
    try {
      const { getDispatchedTrack } = await import("@repo/server/operations/data")
      const dispatched = await getDispatchedTrack({ context, roomId })
      const dispatchedId = dispatched?.track.mediaSource.trackId
      if (dispatchedId) return dispatchedId
    } catch {
      /* ignore */
    }
    return lastKnownTrackId
  }

  async function shouldApplyEnded(endedSource?: string, endedTrackId?: string): Promise<boolean> {
    const active = (await getActiveSource?.()) ?? null
    if (!endedSourceMatchesActive(endedSource, active)) return false
    const currentTrackId = await resolveCurrentTrackId()
    return endedTrackMatchesCurrent(endedTrackId, currentTrackId)
  }

  async function forgetStaleEndSignals() {
    capability.clearLastPlaybackSignals()
    try {
      await context.redis.pubClient.del(lastEndedKey(roomId))
    } catch {
      /* ignore */
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

      await forgetStaleEndSignals()

      const nextItem = await popNextFromQueue({ context, roomId })
      if (!nextItem) {
        console.log(`[bridge-advance] queue empty for room ${roomId}`)
        stuckNoMediaPolls = 0
        lastKnownProgressMs = null
        lastKnownDurationMs = null
        lastKnownTrackId = null
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
      lastKnownProgressMs = null
      lastKnownDurationMs = null
      lastKnownTrackId = nextItem.track.mediaSource.trackId
      // New track: reset probe cadence so we can detect early stuck/no-media
      probeIntervalMs = NEAR_END_PROBE_INTERVAL_MS
      lastProbeAt = 0

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
    if (event.type !== "ENDED") return
    void (async () => {
      if (!(await shouldApplyEnded(event.source, event.trackId))) return
      await advanceToNext("ended-event", event.reason)
    })()
  })

  function desiredProbeIntervalMs(): number {
    if (rpcFailureCount > 0) {
      return Math.min(
        MAX_PROBE_BACKOFF_MS,
        INITIAL_PROBE_BACKOFF_MS * 2 ** (rpcFailureCount - 1),
      )
    }
    // Tighten while watching for stuck/no-media or when duration says we're near the end
    if (stuckNoMediaPolls > 0) return NEAR_END_PROBE_INTERVAL_MS
    if (isApproachingEnd(lastKnownProgressMs, lastKnownDurationMs)) {
      return NEAR_END_PROBE_INTERVAL_MS
    }
    const lastState = capability.getLastState()
    if (lastState && isApproachingEnd(lastState.progressMs, lastState.durationMs)) {
      return NEAR_END_PROBE_INTERVAL_MS
    }
    return HEALTHY_PROBE_INTERVAL_MS
  }

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

        // Keep Spotify SDK token fresh even if TOKEN_REQUEST pub/sub was missed
        try {
          const { ensureSpotifyTokenProvisioned } = await import("./spotifyTokenProvisioner")
          await ensureSpotifyTokenProvisioned({ context, roomId })
        } catch {
          /* ignore — SDK host is optional */
        }

        const activeSource = (await getActiveSource?.()) ?? null

        const currentTrackId = await resolveCurrentTrackId()

        // 1) Durable ENDED key (written by daemon) — does not depend on pub/sub
        const endedRaw = await context.redis.pubClient.get(lastEndedKey(roomId))
        if (endedRaw) {
          await context.redis.pubClient.del(lastEndedKey(roomId))
          console.log(`[bridge-advance] consumed last_ended key: ${endedRaw}`)
          let endedReason: string | undefined
          let endedSource: string | undefined
          let endedTrackId: string | undefined
          try {
            const parsed = JSON.parse(endedRaw) as {
              reason?: string
              source?: string
              trackId?: string
            }
            endedReason = parsed.reason
            endedSource = parsed.source
            endedTrackId = parsed.trackId
          } catch {
            /* legacy plain payloads */
          }
          if (await shouldApplyEnded(endedSource, endedTrackId)) {
            await advanceToNext("ended-event", endedReason)
            return
          }
        }

        // 2) In-memory ENDED from pub/sub (if subscription works)
        const ended = capability.consumeLastEnded()
        if (ended && (await shouldApplyEnded(ended.source, ended.trackId))) {
          await advanceToNext("ended-event", ended.reason)
          return
        }

        // 3) Cheap near-end / volume checks from last STATE pub/sub (no RPC)
        const lastState = capability.getLastState()
        if (lastState?.volumePercent != null && lastState.source === (activeSource ?? lastState.source)) {
          await handlePlaybackVolumeChange({
            context,
            roomId,
            volumePercent: lastState.volumePercent,
          })
        }

        if (lastState && lastStateShouldAdvance(lastState, activeSource, currentTrackId)) {
          await advanceToNext(
            lastState.state === "playing" ? "state-probe" : "state-ended",
          )
          return
        }

        // 4) getPlayback probe — softer cadence when healthy; tighter near end / stuck
        const now = Date.now()
        probeIntervalMs = desiredProbeIntervalMs()
        if (now - lastProbeAt < probeIntervalMs) {
          return
        }
        lastProbeAt = now

        const api = await getPlaybackApi()
        if (!api) return

        try {
          const playback = await api.getPlayback()
          rpcFailureCount = 0
          const playbackTrackId =
            playback.track && typeof playback.track === "object" && "id" in playback.track
              ? String((playback.track as { id: string }).id)
              : null
          const previousKnown =
            lastKnownProgressMs != null || lastKnownDurationMs != null
              ? {
                  state: "playing" as const,
                  progressMs: lastKnownProgressMs,
                  durationMs: lastKnownDurationMs,
                  trackId: lastKnownTrackId,
                }
              : null
          lastKnownProgressMs =
            typeof playback.progressMs === "number" ? playback.progressMs : lastKnownProgressMs
          lastKnownDurationMs =
            typeof playback.durationMs === "number" ? playback.durationMs : lastKnownDurationMs
          if (playbackTrackId && (!lastKnownTrackId || playbackTrackId === lastKnownTrackId)) {
            lastKnownTrackId = playbackTrackId
          }

          await handlePlaybackStateChange({
            context,
            roomId,
            state: playback.state,
            trackId: playbackTrackId,
          })

          if (
            isNaturalFinish(
              {
                state: playback.state,
                progressMs: playback.progressMs,
                durationMs: playback.durationMs,
                trackId: playbackTrackId,
              },
              previousKnown,
            )
          ) {
            await advanceToNext(
              playback.state === "playing" ? "playback-probe" : "state-ended",
            )
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
                `[bridge-advance] stuck no-media (${stuckNoMediaPolls} polls, state=${playback.state}) — skipping`,
              )
              await advanceToNext("stuck-stopped")
              return
            }
          } else if (hasPlayableMedia(playback) && playback.state === "playing") {
            stuckNoMediaPolls = 0
          }
        } catch {
          /* daemon/spotify unavailable — exponential backoff on next probe */
          rpcFailureCount += 1
        }
      } catch (e) {
        console.error(`[bridge-player-${roomId}] error:`, e)
      }
    },
  }
}
