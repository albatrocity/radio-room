import { create } from "zustand"
import xstate from "zustand-middleware-xstate"
import { audioMachine } from "../machines/audioMachine"

export const useAudioStore = create(xstate(audioMachine))

// Track metadata
export const useStationMeta = () => useAudioStore((s) => s.state.context.meta)
export const useCover = () => useAudioStore((s) => s.state.context.meta?.artwork)

// MediaSource status
export const useMediaSourceStatus = () => useAudioStore((s) => s.state.context.mediaSourceStatus)
export const useIsStationOnline = () =>
  useAudioStore((s) => s.state.context.mediaSourceStatus === "online")

// Current track ID (stable identifier for reactions, etc.)
export const useCurrentTrackId = () =>
  useAudioStore((s) => s.state.context.meta?.nowPlaying?.mediaSource?.trackId || "")

// Whether we have track data (regardless of fetch status)
export const useHasTrackData = () =>
  useAudioStore((s) => !!s.state.context.meta?.nowPlaying?.track)

// Playback state (for audio player UI)
export const useIsPlaying = () => useAudioStore((s) => s.state.matches("online.progress.playing"))
export const useIsMuted = () => useAudioStore((s) => s.state.matches("online.volume.muted"))
export const useVolume = () => useAudioStore((s) => s.state.context.volume)
export const useIsBuffering = () =>
  useAudioStore((s) => s.state.matches("online.progress.playing.loading"))
