import { assign, setup } from "xstate"
import { emitToSocket } from "../actors/socketActor"
import { toast } from "../lib/toasts"
import type { ShowMusicTransport } from "../lib/showMusicControl"

export type ShowMusicControlContext = {
  transport: ShowMusicTransport
  canResume: boolean
}

type PlaybackPayload = {
  state?: Exclude<ShowMusicTransport, null>
  canResume?: boolean
  action?: string
  trackTitle?: string
  message?: string
}

type ShowMusicControlEvent =
  | { type: "ACTIVATE" }
  | { type: "DEACTIVATE" }
  | { type: "TOGGLE" }
  | { type: "PLAYBACK_STATE"; data: PlaybackPayload }
  | { type: "PLAYBACK_STATE_CHANGED"; data: PlaybackPayload }
  | { type: "GET_PLAYBACK_STATE_FAILURE"; data?: PlaybackPayload }
  | { type: "TOGGLE_PLAYBACK_SUCCESS"; data: PlaybackPayload }
  | { type: "TOGGLE_PLAYBACK_FAILURE"; data: PlaybackPayload }

/** SERVER_EVENT allowlist for `useSocketMachine` (ADR 0093) — keep in sync with socket-driven events. */
export const SHOW_MUSIC_CONTROL_EVENT_TYPES = [
  "PLAYBACK_STATE",
  "PLAYBACK_STATE_CHANGED",
  "GET_PLAYBACK_STATE_FAILURE",
  "TOGGLE_PLAYBACK_SUCCESS",
  "TOGGLE_PLAYBACK_FAILURE",
] as const

function transportFrom(data: PlaybackPayload | undefined): ShowMusicTransport {
  return data?.state ?? null
}

function canResumeFrom(
  data: PlaybackPayload | undefined,
  previous: boolean,
): boolean {
  if (typeof data?.canResume === "boolean") return data.canResume
  if (data?.state === "playing") return true
  return previous
}

export const showMusicControlMachine = setup({
  types: {
    context: {} as ShowMusicControlContext,
    events: {} as ShowMusicControlEvent,
  },
  actions: {
    requestPlaybackState: () => {
      emitToSocket("GET_PLAYBACK_STATE", {})
    },
    emitToggle: () => {
      emitToSocket("TOGGLE_PLAYBACK", {})
    },
    applyPlaybackState: assign(({ context, event }) => {
      if (
        event.type !== "PLAYBACK_STATE" &&
        event.type !== "PLAYBACK_STATE_CHANGED" &&
        event.type !== "TOGGLE_PLAYBACK_SUCCESS"
      ) {
        return {}
      }
      return {
        transport: transportFrom(event.data) ?? context.transport,
        canResume: canResumeFrom(event.data, context.canResume),
      }
    }),
    clearPlaybackState: assign({
      transport: () => null as ShowMusicTransport,
      canResume: () => false,
    }),
    reset: assign({
      transport: () => null as ShowMusicTransport,
      canResume: () => false,
    }),
    notifyAdvanced: ({ event }) => {
      if (event.type !== "TOGGLE_PLAYBACK_SUCCESS") return
      if (event.data.action !== "advanced" || !event.data.trackTitle) return
      toast({
        title: "Now playing",
        description: event.data.trackTitle,
        type: "success",
        duration: 3000,
      })
    },
    notifyToggleFailure: ({ event }) => {
      if (event.type !== "TOGGLE_PLAYBACK_FAILURE") return
      toast({
        title: "Couldn't control playback",
        description: event.data?.message,
        type: "error",
        duration: 4000,
      })
    },
  },
}).createMachine({
  id: "showMusicControl",
  initial: "inactive",
  context: {
    transport: null,
    canResume: false,
  },
  states: {
    inactive: {
      on: {
        ACTIVATE: {
          target: "active",
          actions: ["requestPlaybackState"],
        },
      },
    },
    active: {
      initial: "ready",
      on: {
        DEACTIVATE: {
          target: "inactive",
          actions: ["reset"],
        },
        PLAYBACK_STATE: {
          actions: ["applyPlaybackState"],
        },
        PLAYBACK_STATE_CHANGED: {
          actions: ["applyPlaybackState", "requestPlaybackState"],
        },
        GET_PLAYBACK_STATE_FAILURE: {
          actions: ["clearPlaybackState"],
        },
      },
      states: {
        ready: {
          on: {
            TOGGLE: {
              target: "pending",
              actions: ["emitToggle"],
            },
            TOGGLE_PLAYBACK_SUCCESS: {
              actions: ["applyPlaybackState", "notifyAdvanced"],
            },
          },
        },
        pending: {
          after: {
            10_000: "ready",
          },
          on: {
            TOGGLE_PLAYBACK_SUCCESS: {
              target: "ready",
              actions: ["applyPlaybackState", "notifyAdvanced"],
            },
            TOGGLE_PLAYBACK_FAILURE: {
              target: "ready",
              actions: ["notifyToggleFailure"],
            },
          },
        },
      },
    },
  },
})
