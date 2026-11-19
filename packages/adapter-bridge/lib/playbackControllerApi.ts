import type { PlaybackControllerApi, PlaybackState, MetadataSourceTrack } from "@repo/types"
import type { ActiveSourceStore } from "./activeSource"
import {
  clearPlayTrackStart,
  recordPlayTrackStart,
  setPendingNowPlaying,
  takePendingNowPlayingIfPlaying,
} from "./advanceWatchdog"
import { parseBridgeMediaId } from "./parseBridgeMediaId"
import type { BridgeRpcClient } from "./rpcClient"
import type { BridgeCapabilityCache } from "./capability"

/**
 * getPlayback is polled every 1–3s by the advance job, so it must fail fast: the
 * default 8s RPC timeout is longer than the poll interval and lets one unresponsive
 * daemon call delay later ticks.
 */
const GET_PLAYBACK_TIMEOUT_MS = 2500

/**
 * Lease renewal recreates the SDK player and waits for `ready` + Connect listing,
 * which can outlast the default RPC timeout. Only paid when the lease is stale.
 */
const PREPARE_SPOTIFY_TIMEOUT_MS = 15_000

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

export function createBridgePlaybackApi(deps: {
  roomId: string
  rpc: BridgeRpcClient
  getSpotifyDelegate: () => Promise<PlaybackControllerApi | null>
  activeSource: ActiveSourceStore
  /** Optional: resolve title/artist/album for now-playing / notify */
  getPlayMeta?: () => Promise<{ title?: string; artist?: string; album?: string } | null>
  /** Flush deferred now-playing when STATE reports the commanded track playing. */
  capability?: BridgeCapabilityCache
  /** Clear Redis admin-pause hold when a new track starts (ADR 0211). */
  clearUserPause?: () => Promise<void>
}): PlaybackControllerApi {
  const { rpc, getSpotifyDelegate, activeSource, getPlayMeta, capability, roomId } = deps

  async function flushPendingNowPlaying(params: {
    trackId?: string | null
    state?: string | null
    progressMs?: number | null
    durationMs?: number | null
  }): Promise<void> {
    const pending = takePendingNowPlayingIfPlaying({
      roomId,
      trackId: params.trackId,
      state: params.state,
      hasPlayableMedia: hasPlayableMedia(params),
    })
    if (!pending) return
    try {
      await rpc.notify("notifyNowPlaying", {
        title: pending.title ?? "",
        artist: pending.artist ?? "",
        album: pending.album ?? "",
      })
    } catch (error) {
      console.warn("[bridge] deferred notifyNowPlaying failed:", error)
    }
  }

  if (capability) {
    capability.onEvent((event) => {
      if (event.type !== "STATE") return
      void flushPendingNowPlaying({
        trackId: event.trackId,
        state: event.state,
        progressMs: event.progressMs,
        durationMs: event.durationMs,
      })
    })
  }

  /**
   * Ask the daemon to renew a stale Spotify SDK lease before we command playback
   * (ADR 0161). Best effort: a daemon without an SDK device host, or one that
   * times out, must not block the play — the Web API path still has its own
   * device fallbacks.
   */
  async function prepareSpotifyDevice(): Promise<void> {
    try {
      const result = (await rpc.call(
        "prepareSpotify",
        {},
        { timeoutMs: PREPARE_SPOTIFY_TIMEOUT_MS },
      )) as { deviceId?: string | null; recreated?: boolean } | null
      if (result?.recreated) {
        console.log(`[bridge] renewed Spotify SDK lease before play (device ${result.deviceId})`)
      }
    } catch (e) {
      console.warn("[bridge] prepareSpotify failed (continuing):", e)
    }
  }

  async function pauseSource(source: string): Promise<void> {
    try {
      if (source === "spotify") {
        const delegate = await getSpotifyDelegate()
        await delegate?.pause()
        return
      }
      await rpc.call("pause", { source })
    } catch (e) {
      // Best-effort: Spotify often 403s (no device / already paused / restriction)
      // when switching to YouTube/local — must not block the new playTrack.
      console.warn(`[bridge] pause ${source} failed (continuing):`, e)
    }
  }

  const api: PlaybackControllerApi = {
    async playTrack(mediaId: string) {
      const { source, trackId } = parseBridgeMediaId(mediaId)
      const prev = await activeSource.get()
      if (prev && prev !== source) {
        await pauseSource(prev)
      }

      let leftTrackId: string | null = null
      try {
        const current = await api.getPlayback()
        if (current.track && typeof current.track === "object" && "id" in current.track) {
          leftTrackId = String((current.track as { id: string }).id)
        }
      } catch {
        /* ignore — start command still records the dispatched id */
      }

      recordPlayTrackStart(roomId, {
        leftTrackId,
        dispatchedTrackId: trackId,
      })
      await deps.clearUserPause?.()

      // Mark active source before playback so probes/ENDED target the right driver
      // even if the embed fails immediately.
      await activeSource.set(source)

      const lastVolume = await activeSource.getLastVolume()
      const meta = (await getPlayMeta?.()) ?? {}
      setPendingNowPlaying(roomId, {
        trackId,
        title: meta.title,
        artist: meta.artist,
        album: meta.album,
      })

      if (source === "spotify") {
        const delegate = await getSpotifyDelegate()
        if (!delegate) throw new Error("Spotify delegate unavailable")
        // Renew before resolving the device: the daemon writes the new device id
        // to Redis on ready, which is what the delegate reads as preferred.
        await prepareSpotifyDevice()
        await delegate.playTrack(trackId)
        if (lastVolume != null && delegate.setVolume) {
          await delegate.setVolume(lastVolume)
        }
        // Now-playing posts only after STATE/getPlayback shows this track playing
        // (ADR 0211) — avoids playlist rows for tracks the watchdog never airs.
      } else {
        await rpc.call("playTrack", {
          source,
          trackId,
          volumePercent: lastVolume ?? undefined,
          title: meta.title,
          artist: meta.artist,
          album: meta.album,
          deferNowPlaying: true,
        })
      }
    },

    async getPlayback() {
      const source = await activeSource.get()
      if (!source) {
        return { state: "stopped", track: null }
      }

      // Prefer daemon-local state (SDK getCurrentState / driver). Avoids polling
      // Spotify Web API from the API container on every admin scrubber refresh.
      try {
        const result = (await rpc.call(
          "getPlayback",
          { source },
          { timeoutMs: GET_PLAYBACK_TIMEOUT_MS },
        )) as {
          state: PlaybackState
          trackId?: string | null
          progressMs?: number | null
          durationMs?: number | null
          volumePercent?: number | null
          observed?: boolean
        }
        // Spotify SDK answer is authoritative (including stopped) so we don't fall
        // through to Web API polling from the API container — but only when the daemon
        // actually read the transport. A detached SDK reports no view, and treating
        // that as a stop blanks the progress bar and makes the advance watchdog skip
        // every track.
        if (result && result.observed !== false) {
          if (source === "spotify" || result.state !== "stopped") {
            const trackId = result.trackId || (result.state === "stopped" ? null : source)
            const lastVolume = await activeSource.getLastVolume()
            const volumePercent =
              typeof result.volumePercent === "number" ? result.volumePercent : lastVolume
            if (result.state === "playing" && hasPlayableMedia(result)) {
              void flushPendingNowPlaying({
                trackId,
                state: result.state,
                progressMs: result.progressMs,
                durationMs: result.durationMs,
              })
            }
            return {
              state: result.state,
              // Stub track keeps togglePlayback from advancing mid-track on pause.
              track: trackId ? ({ id: trackId } as MetadataSourceTrack) : null,
              progressMs: result.progressMs ?? null,
              durationMs: result.durationMs ?? null,
              volumePercent,
            }
          }
          // A driver owns its own process, so its stop is a real one (e.g. media that
          // never became playable) and must stay actionable for the advance watchdog.
          return { state: "stopped", track: null }
        }
      } catch (e) {
        console.warn(`[bridge] getPlayback RPC failed for ${source}:`, e)
      }

      // Fallback: Spotify Web API when the daemon RPC failed or reported no view
      // (no SDK device / detached player / daemon down).
      if (source === "spotify") {
        const delegate = await getSpotifyDelegate()
        if (!delegate) return { state: "stopped" as PlaybackState, track: null, observed: false }
        const fallback = await delegate.getPlayback()
        if (fallback.state === "playing" && hasPlayableMedia(fallback)) {
          const trackId =
            fallback.track && typeof fallback.track === "object" && "id" in fallback.track
              ? String((fallback.track as { id: string }).id)
              : null
          void flushPendingNowPlaying({
            trackId,
            state: fallback.state,
            progressMs: fallback.progressMs,
            durationMs: fallback.durationMs,
          })
        }
        return fallback
      }

      return { state: "stopped", track: null, observed: false }
    },

    async pause() {
      const source = await activeSource.get()
      if (!source) return
      if (source === "spotify") {
        const delegate = await getSpotifyDelegate()
        await delegate?.pause()
        return
      }
      await rpc.call("pause", { source })
    },

    async play() {
      const source = await activeSource.get()
      if (!source) return
      clearPlayTrackStart(roomId)
      await deps.clearUserPause?.()
      if (source === "spotify") {
        const delegate = await getSpotifyDelegate()
        if (!delegate) return
        // Resuming after a long pause is the same stale-lease case as playTrack.
        await prepareSpotifyDevice()
        await delegate.play()
        return
      }
      await rpc.call("play", { source })
    },

    async seekTo(position: number) {
      const source = await activeSource.get()
      if (!source) return
      if (source === "spotify") {
        const delegate = await getSpotifyDelegate()
        await delegate?.seekTo(position)
        return
      }
      await rpc.call("seekTo", { source, positionMs: position })
    },

    async setVolume(volumePercent: number) {
      await activeSource.setLastVolume(volumePercent)
      const source = await activeSource.get()
      if (!source) return
      if (source === "spotify") {
        const delegate = await getSpotifyDelegate()
        await delegate?.setVolume?.(volumePercent)
        return
      }
      await rpc.call("setVolume", { source, percent: volumePercent })
    },

    async skipToNextTrack() {
      const source = await activeSource.get()
      if (source === "spotify") {
        const delegate = await getSpotifyDelegate()
        if (!delegate) return []
        return delegate.skipToNextTrack()
      }
      if (source) {
        await rpc.call("stop", { source })
        await activeSource.clear()
      }
      return []
    },

    async getQueue() {
      return []
    },
    async addToQueue() {
      return []
    },
    async skipToPreviousTrack() {
      return []
    },
  }

  return api
}
