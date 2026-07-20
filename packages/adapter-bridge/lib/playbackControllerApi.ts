import type { PlaybackControllerApi, PlaybackState, MetadataSourceTrack } from "@repo/types"
import type { ActiveSourceStore } from "./activeSource"
import { parseBridgeMediaId } from "./parseBridgeMediaId"
import type { BridgeRpcClient } from "./rpcClient"

export function createBridgePlaybackApi(deps: {
  roomId: string
  rpc: BridgeRpcClient
  getSpotifyDelegate: () => Promise<PlaybackControllerApi | null>
  activeSource: ActiveSourceStore
  /** Optional: resolve title/artist/album for now-playing / notify */
  getPlayMeta?: () => Promise<{ title?: string; artist?: string; album?: string } | null>
}): PlaybackControllerApi {
  const { rpc, getSpotifyDelegate, activeSource, getPlayMeta } = deps

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

  return {
    async playTrack(mediaId: string) {
      const { source, trackId } = parseBridgeMediaId(mediaId)
      const prev = await activeSource.get()
      if (prev && prev !== source) {
        await pauseSource(prev)
      }

      // Mark active source before playback so probes/ENDED target the right driver
      // even if the embed fails immediately.
      await activeSource.set(source)

      const lastVolume = await activeSource.getLastVolume()
      const meta = (await getPlayMeta?.()) ?? {}

      if (source === "spotify") {
        const delegate = await getSpotifyDelegate()
        if (!delegate) throw new Error("Spotify delegate unavailable")
        await delegate.playTrack(trackId)
        if (lastVolume != null && delegate.setVolume) {
          await delegate.setVolume(lastVolume)
        }
        void rpc.notify("notifyNowPlaying", {
          title: meta.title ?? "",
          artist: meta.artist ?? "",
          album: meta.album ?? "",
        })
      } else {
        await rpc.call("playTrack", {
          source,
          trackId,
          volumePercent: lastVolume ?? undefined,
          title: meta.title,
          artist: meta.artist,
          album: meta.album,
        })
      }
    },

    async getPlayback() {
      const source = await activeSource.get()
      if (source === "spotify") {
        const delegate = await getSpotifyDelegate()
        if (!delegate) return { state: "stopped" as PlaybackState, track: null }
        return delegate.getPlayback()
      }
      if (source) {
        const result = (await rpc.call("getPlayback", {})) as {
          state: PlaybackState
          trackId?: string | null
          progressMs?: number | null
          durationMs?: number | null
        }
        // togglePlayback uses shouldAdvanceToNextQueueItem, which treats missing track as
        // "idle → start next queue item". Always return a stub track while a bridge source
        // is active so mid-track pause resumes via play() instead of advancing.
        const trackId = result.trackId || source
        return {
          state: result.state,
          track: { id: trackId } as MetadataSourceTrack,
          progressMs: result.progressMs ?? null,
          durationMs: result.durationMs ?? null,
        }
      }
      return { state: "stopped", track: null }
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
      if (source === "spotify") {
        const delegate = await getSpotifyDelegate()
        await delegate?.play()
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
}
