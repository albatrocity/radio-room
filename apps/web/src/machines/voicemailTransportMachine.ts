import { assign, setup } from "xstate"

/** Who owns the current voicemail. Bridge and the local element never share it. */
export type VoicemailTransportOwner = "idle" | "local" | "bridge"

export type VoicemailTransportContext = {
  owner: VoicemailTransportOwner
  selectedId: string | null
  playbackUrl: string | null
  playing: boolean
  positionMs: number
  durationMs: number
  playError: string | null
}

const idleContext: VoicemailTransportContext = {
  owner: "idle",
  selectedId: null,
  playbackUrl: null,
  playing: false,
  positionMs: 0,
  durationMs: 0,
  playError: null,
}

type PlayResult = {
  id: string
  url: string
  durationMs: number
  bridge: boolean
}

type PlaybackPoll = {
  observed: boolean
  state: "playing" | "paused" | "stopped"
  progressMs: number | null
  durationMs: number | null
}

type VoicemailTransportEvent =
  | { type: "RESET" }
  | { type: "CLEAR_ERROR" }
  | { type: "PLAY_RESULT"; data: PlayResult }
  | { type: "PLAY_FAILURE"; message: string }
  | { type: "STOP" }
  | { type: "HIDDEN"; id: string }
  | { type: "BRIDGE_LOST" }
  | { type: "BRIDGE_PAUSED" }
  | { type: "TRANSPORT_FAILURE" }
  | { type: "PLAYBACK_POLL"; data: PlaybackPoll }
  | { type: "SEEK"; positionMs: number }
  | { type: "LOCAL_PLAYING"; playing: boolean }
  | { type: "LOCAL_TIME"; positionMs: number }
  | { type: "LOCAL_DURATION"; durationMs: number }
  | { type: "LOCAL_ENDED" }
  | { type: "LOCAL_ERROR"; message: string }

function handToLocal(context: VoicemailTransportContext): Partial<VoicemailTransportContext> {
  if (context.owner !== "bridge") return {}
  return { owner: "local" }
}

export const voicemailTransportMachine = setup({
  types: {
    context: {} as VoicemailTransportContext,
    events: {} as VoicemailTransportEvent,
  },
  guards: {
    hiddenIsSelected: ({ context, event }) =>
      event.type === "HIDDEN" && context.selectedId === event.id,
    pollObservedOnBridge: ({ context, event }) =>
      event.type === "PLAYBACK_POLL" && context.owner === "bridge" && event.data.observed,
    pollUnobservedOnBridge: ({ context, event }) =>
      event.type === "PLAYBACK_POLL" && context.owner === "bridge" && !event.data.observed,
    bridgeOwns: ({ context }) => context.owner === "bridge",
    localOwns: ({ context }) => context.owner === "local",
  },
  actions: {
    reset: assign(() => idleContext),
    clearError: assign({ playError: null }),
    clearSelection: assign(() => idleContext),
    applyPlayResult: assign(({ event }) => {
      if (event.type !== "PLAY_RESULT") return {}
      return {
        selectedId: event.data.id,
        playbackUrl: event.data.url,
        durationMs: event.data.durationMs,
        positionMs: 0,
        playError: null,
        playing: false,
        owner: event.data.bridge ? "bridge" : "local",
      }
    }),
    playFailure: assign(({ event }) => {
      if (event.type !== "PLAY_FAILURE") return {}
      return { playError: event.message, playing: false }
    }),
    handToLocal: assign(({ context }) => handToLocal(context)),
    bridgePaused: assign({ playing: false }),
    applyPoll: assign(({ event }) => {
      if (event.type !== "PLAYBACK_POLL") return {}
      return {
        playing: event.data.state === "playing",
        ...(event.data.progressMs != null ? { positionMs: event.data.progressMs } : {}),
        ...(event.data.durationMs != null && event.data.durationMs > 0
          ? { durationMs: event.data.durationMs }
          : {}),
      }
    }),
    seek: assign(({ event }) => {
      if (event.type !== "SEEK") return {}
      return { positionMs: Math.max(0, event.positionMs) }
    }),
    localPlaying: assign(({ event }) => {
      if (event.type !== "LOCAL_PLAYING") return {}
      return { playing: event.playing }
    }),
    localTime: assign(({ event }) => {
      if (event.type !== "LOCAL_TIME") return {}
      return { positionMs: event.positionMs }
    }),
    localDuration: assign(({ event }) => {
      if (event.type !== "LOCAL_DURATION") return {}
      return { durationMs: event.durationMs }
    }),
    localEnded: assign({ playing: false, positionMs: 0 }),
    localError: assign(({ event }) => {
      if (event.type !== "LOCAL_ERROR") return {}
      return { playError: event.message, playing: false }
    }),
  },
}).createMachine({
  id: "voicemailTransport",
  initial: "ready",
  context: idleContext,
  states: {
    ready: {
      on: {
        RESET: { actions: "reset" },
        CLEAR_ERROR: { actions: "clearError" },
        STOP: { actions: "clearSelection" },
        HIDDEN: { guard: "hiddenIsSelected", actions: "clearSelection" },
        PLAY_RESULT: { actions: "applyPlayResult" },
        PLAY_FAILURE: { actions: "playFailure" },
        BRIDGE_LOST: { guard: "bridgeOwns", actions: "handToLocal" },
        TRANSPORT_FAILURE: { guard: "bridgeOwns", actions: "handToLocal" },
        BRIDGE_PAUSED: { guard: "bridgeOwns", actions: "bridgePaused" },
        PLAYBACK_POLL: [
          { guard: "pollUnobservedOnBridge", actions: "handToLocal" },
          { guard: "pollObservedOnBridge", actions: "applyPoll" },
        ],
        SEEK: { actions: "seek" },
        LOCAL_PLAYING: { guard: "localOwns", actions: "localPlaying" },
        LOCAL_TIME: { guard: "localOwns", actions: "localTime" },
        LOCAL_DURATION: { guard: "localOwns", actions: "localDuration" },
        LOCAL_ENDED: { guard: "localOwns", actions: "localEnded" },
        LOCAL_ERROR: { guard: "localOwns", actions: "localError" },
      },
    },
  },
})
