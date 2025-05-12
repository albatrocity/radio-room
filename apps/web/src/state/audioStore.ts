import { create } from "zustand"
import xstate from "zustand-middleware-xstate"
import { audioMachine } from "../machines/audioMachine"

export const useAudioStore = create(xstate(audioMachine))

export const useCover = () =>
  useAudioStore((s) => s.state.context.meta?.artwork)
export const useIsStationOnline = () =>
  useAudioStore((s) => s.state.matches("online"))

export const useIsPlaying = () =>
  useAudioStore((s) => s.state.matches("online.progress.playing"))
export const useIsMuted = () =>
  useAudioStore((s) => s.state.matches("online.volume.muted"))
export const useVolume = () => useAudioStore((s) => s.state.context.volume)
export const useStationMeta = () => useAudioStore((s) => s.state.context.meta)
export const useIsBuffering = () =>
  useAudioStore((s) => s.state.matches("online.progress.playing.loading"))
