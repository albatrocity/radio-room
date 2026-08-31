/**
 * Radio listen lifecycle (ADR 0138 / 0139).
 *
 * Owns connect / pause / reconnect / failure. The audio-rate work lives in
 * `radioStreamEngine`: one run is invoked per connection, and stopping the
 * invocation aborts the fetch, frees the decoder, and mutes output — so stale
 * decode results cannot reach the speakers after a pause.
 */

import { setup, assign, emit, fromCallback, type AnyEventObject } from "xstate"
import { startRadioStreamRun } from "../lib/radioStreamEngine"

/** Stream ended on its own (server hiccup) — wait before reconnecting. */
const RECONNECT_DELAY_MS = 1200

export type RadioStreamContext = {
  url: string | null
  playing: boolean
  httpStatus: number | null
  contentType: string | null
  error: string | null
}

export type RadioStreamEvent =
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | { type: "SET_URL"; url: string }
  | { type: "CONNECTED"; httpStatus: number; contentType: string | null }
  | { type: "STREAMING" }
  | { type: "PLAYBACK_STARTED" }
  | { type: "ENDED"; framesScheduled: number }
  | { type: "ERROR"; message: string }
  /** Player unmounted — drop the stream and forget the url. */
  | { type: "TEARDOWN" }

/** Consumed by radioStreamActor to drive audioMachine (LOADED / PLAY / STOP). */
export type RadioStreamEmitted =
  | { type: "playbackStarted" }
  | { type: "failed"; message: string }

export const radioStreamMachine = setup({
  types: {
    context: {} as RadioStreamContext,
    events: {} as RadioStreamEvent,
    emitted: {} as RadioStreamEmitted,
  },
  actors: {
    streamRun: fromCallback<AnyEventObject, { url: string }>(({ input, sendBack }) => {
      const run = startRadioStreamRun(input.url, {
        onConnected: (info) => sendBack({ type: "CONNECTED", ...info }),
        onStreaming: () => sendBack({ type: "STREAMING" }),
        onPlaybackStarted: () => sendBack({ type: "PLAYBACK_STARTED" }),
        onEnded: (info) => sendBack({ type: "ENDED", ...info }),
        onError: (message: string) => sendBack({ type: "ERROR", message }),
      })
      return () => run.stop()
    }),
  },
  guards: {
    canConnect: ({ context }) => context.playing && Boolean(context.url),
    hasUrl: ({ context }) => Boolean(context.url),
    deliveredAudio: ({ event }) => event.type === "ENDED" && event.framesScheduled > 0,
  },
  actions: {
    setPlaying: assign({ playing: true }),
    clearPlaying: assign({ playing: false }),
    setUrl: assign({
      url: ({ event }) => (event.type === "SET_URL" ? event.url : null),
      error: null,
    }),
    clearError: assign({ error: null, httpStatus: null, contentType: null }),
    setResponse: assign({
      httpStatus: ({ event }) => (event.type === "CONNECTED" ? event.httpStatus : null),
      contentType: ({ event }) => (event.type === "CONNECTED" ? event.contentType : null),
    }),
    setError: assign({
      error: ({ event }) => (event.type === "ERROR" ? event.message : "streamFailed"),
    }),
    setEndedWithoutAudio: assign({ error: "streamEndedWithoutFrames" }),
    reset: assign({
      url: null,
      playing: false,
      httpStatus: null,
      contentType: null,
      error: null,
    }),
    emitPlaybackStarted: emit({ type: "playbackStarted" as const }),
    emitFailed: emit(({ context }) => ({
      type: "failed" as const,
      message: context.error ?? "streamFailed",
    })),
  },
}).createMachine({
  id: "radioStream",
  initial: "idle",
  context: {
    url: null,
    playing: false,
    httpStatus: null,
    contentType: null,
    error: null,
  },
  on: {
    SET_URL: [
      {
        guard: ({ context, event }) => context.playing && event.url !== context.url,
        target: ".active",
        reenter: true,
        actions: ["setUrl"],
      },
      { actions: ["setUrl"] },
    ],
    PAUSE: { target: ".idle", actions: ["clearPlaying"] },
    TEARDOWN: { target: ".idle", actions: ["reset"] },
  },
  states: {
    idle: {
      on: {
        PLAY: [
          { guard: "hasUrl", target: "active", actions: ["setPlaying", "clearError"] },
          { actions: ["setPlaying"] },
        ],
      },
      always: { guard: "canConnect", target: "active" },
    },

    active: {
      entry: ["clearError"],
      invoke: {
        src: "streamRun",
        input: ({ context }) => ({ url: context.url ?? "" }),
      },
      initial: "connecting",
      states: {
        connecting: {
          on: { STREAMING: "streaming" },
        },
        streaming: {},
      },
      on: {
        CONNECTED: { actions: ["setResponse"] },
        PLAYBACK_STARTED: { actions: ["emitPlaybackStarted"] },
        // A stream that delivered audio dropped out; one that never did is broken.
        ENDED: [
          { guard: "deliveredAudio", target: "reconnecting" },
          { target: "failed", actions: ["setEndedWithoutAudio", "emitFailed"] },
        ],
        ERROR: { target: "failed", actions: ["setError", "emitFailed"] },
      },
    },

    reconnecting: {
      after: {
        [RECONNECT_DELAY_MS]: [
          { guard: "canConnect", target: "active" },
          { target: "idle" },
        ],
      },
    },

    failed: {
      on: {
        PLAY: [
          { guard: "hasUrl", target: "active", actions: ["setPlaying", "clearError"] },
          { actions: ["setPlaying"] },
        ],
      },
    },
  },
})
