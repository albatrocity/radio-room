/**
 * Radio listen lifecycle (ADR 0139 / 0140).
 *
 * Two parallel regions:
 *
 * - `playback` — the `<audio>` element that owns audible output. Its own
 *   events drive the states, so "playing" means sound is actually happening.
 * - `analysis` — the silent decode feeding the oscilloscope. Runs only while
 *   playback is wanted, the tab is visible, and a scope is mounted, so a
 *   listener without the Oscilloscope never opens the second connection.
 *
 * Analysis failures are deliberately quiet: a station we cannot decode (or a
 * scope connection that keeps dropping) costs the trace, never the audio.
 */

import { setup, assign, emit, fromCallback, not, type AnyEventObject } from "xstate"
import { startRadioAnalysisRun } from "../lib/radioAnalysisEngine"
import {
  ensureRadioPlaybackElement,
  getRadioPlaybackDebug,
  playRadioPlayback,
  releaseRadioPlayback,
  setRadioPlaybackUrl,
} from "../lib/radioPlaybackElement"

/** Element dropped the stream (server hiccup) — wait before reconnecting. */
const RECONNECT_DELAY_MS = 1200
/** Consecutive failures without reaching playback before we give up. */
const MAX_PLAYBACK_RETRIES = 3
const ANALYSIS_COOLDOWN_MS = 5000
/** Consecutive analysis failures before the scope is abandoned for this url. */
const MAX_ANALYSIS_FAILURES = 3

export type RadioStreamContext = {
  url: string | null
  playing: boolean
  visible: boolean
  scopeAttached: boolean
  httpStatus: number | null
  contentType: string | null
  error: string | null
  retries: number
  analysisFailures: number
}

export type RadioStreamEvent =
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | { type: "SET_URL"; url: string }
  /** Player unmounted — drop the stream and forget the url. */
  | { type: "TEARDOWN" }
  | { type: "VISIBILITY"; visible: boolean }
  | { type: "SCOPE_ATTACHED" }
  | { type: "SCOPE_DETACHED" }
  | { type: "ELEMENT_PLAYING" }
  | { type: "ELEMENT_ENDED" }
  | { type: "ELEMENT_ERROR"; message: string }
  | { type: "ANALYSIS_CONNECTED"; httpStatus: number; contentType: string | null }
  | { type: "ANALYSIS_STREAMING" }
  | { type: "ANALYSIS_ENDED" }
  | { type: "ANALYSIS_ERROR"; message: string }

/** Consumed by radioStreamActor to drive audioMachine (LOADED / PLAY / STOP). */
export type RadioStreamEmitted =
  | { type: "playbackStarted" }
  | { type: "failed"; message: string }

function mediaErrorMessage(el: HTMLAudioElement): string {
  const code = el.error?.code
  switch (code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return "mediaAborted"
    case MediaError.MEDIA_ERR_NETWORK:
      return "mediaNetwork"
    case MediaError.MEDIA_ERR_DECODE:
      return "mediaDecode"
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return "mediaSrcNotSupported"
    default:
      return "mediaError"
  }
}

export const radioStreamMachine = setup({
  types: {
    context: {} as RadioStreamContext,
    events: {} as RadioStreamEvent,
    emitted: {} as RadioStreamEmitted,
  },
  actors: {
    elementPlayback: fromCallback<AnyEventObject, { url: string }>(({ input, sendBack }) => {
      setRadioPlaybackUrl(input.url)
      const el = ensureRadioPlaybackElement()
      if (!el) {
        sendBack({ type: "ELEMENT_ERROR", message: "noAudioElement" })
        return () => {}
      }
      const onPlaying = () => sendBack({ type: "ELEMENT_PLAYING" })
      const onEnded = () => sendBack({ type: "ELEMENT_ENDED" })
      const onError = () => sendBack({ type: "ELEMENT_ERROR", message: mediaErrorMessage(el) })
      el.addEventListener("playing", onPlaying)
      el.addEventListener("ended", onEnded)
      el.addEventListener("error", onError)
      playRadioPlayback()
      return () => {
        el.removeEventListener("playing", onPlaying)
        el.removeEventListener("ended", onEnded)
        el.removeEventListener("error", onError)
        // Listeners come off first: dropping the source aborts the in-flight
        // load, which some browsers report as a media error.
        releaseRadioPlayback()
      }
    }),
    analysisRun: fromCallback<AnyEventObject, { url: string }>(({ input, sendBack }) => {
      const run = startRadioAnalysisRun(
        input.url,
        {
          onConnected: (info) => sendBack({ type: "ANALYSIS_CONNECTED", ...info }),
          onStreaming: () => sendBack({ type: "ANALYSIS_STREAMING" }),
          onEnded: () => sendBack({ type: "ANALYSIS_ENDED" }),
          onError: (message: string) => sendBack({ type: "ANALYSIS_ERROR", message }),
        },
        // The machine is the only place that knows both paths, so it supplies
        // the element's lag rather than the engine reaching for it.
        { elementLagSec: () => getRadioPlaybackDebug().elementBufferedAheadSec },
      )
      return () => run.stop()
    }),
  },
  guards: {
    canConnect: ({ context }) => context.playing && Boolean(context.url),
    hasUrl: ({ context }) => Boolean(context.url),
    canRetry: ({ context }) => context.retries < MAX_PLAYBACK_RETRIES,
    analysisWanted: ({ context }) =>
      context.playing &&
      context.visible &&
      context.scopeAttached &&
      Boolean(context.url) &&
      context.analysisFailures < MAX_ANALYSIS_FAILURES,
  },
  actions: {
    setPlaying: assign({ playing: true }),
    clearPlaying: assign({ playing: false }),
    setUrl: assign({
      url: ({ event }) => (event.type === "SET_URL" ? event.url : null),
      error: null,
      retries: 0,
      analysisFailures: 0,
    }),
    setVisible: assign({
      visible: ({ event }) => (event.type === "VISIBILITY" ? event.visible : true),
    }),
    attachScope: assign({ scopeAttached: true }),
    detachScope: assign({ scopeAttached: false }),
    clearError: assign({ error: null }),
    setResponse: assign({
      httpStatus: ({ event }) =>
        event.type === "ANALYSIS_CONNECTED" ? event.httpStatus : null,
      contentType: ({ event }) =>
        event.type === "ANALYSIS_CONNECTED" ? event.contentType : null,
    }),
    setError: assign({
      error: ({ event }) => (event.type === "ELEMENT_ERROR" ? event.message : "streamFailed"),
    }),
    countRetry: assign({ retries: ({ context }) => context.retries + 1 }),
    clearRetries: assign({ retries: 0, error: null }),
    countAnalysisFailure: assign({
      analysisFailures: ({ context }) => context.analysisFailures + 1,
    }),
    clearAnalysisFailures: assign({ analysisFailures: 0 }),
    reset: assign({
      url: null,
      playing: false,
      httpStatus: null,
      contentType: null,
      error: null,
      retries: 0,
      analysisFailures: 0,
    }),
    emitPlaybackStarted: emit({ type: "playbackStarted" as const }),
    emitFailed: emit(({ context }) => ({
      type: "failed" as const,
      message: context.error ?? "streamFailed",
    })),
  },
}).createMachine({
  id: "radioStream",
  type: "parallel",
  context: {
    url: null,
    playing: false,
    visible: typeof document === "undefined" ? true : !document.hidden,
    scopeAttached: false,
    httpStatus: null,
    contentType: null,
    error: null,
    retries: 0,
    analysisFailures: 0,
  },
  on: {
    SET_URL: [
      {
        guard: ({ context, event }) => context.playing && event.url !== context.url,
        target: [".playback.active", ".analysis.off"],
        reenter: true,
        actions: ["setUrl"],
      },
      { actions: ["setUrl"] },
    ],
    PAUSE: { target: ".playback.idle", actions: ["clearPlaying"] },
    TEARDOWN: { target: ".playback.idle", actions: ["reset"] },
    VISIBILITY: { actions: ["setVisible"] },
    SCOPE_ATTACHED: { actions: ["attachScope"] },
    SCOPE_DETACHED: { actions: ["detachScope"] },
  },
  states: {
    playback: {
      initial: "idle",
      states: {
        idle: {
          on: {
            PLAY: [
              {
                guard: "hasUrl",
                target: "active",
                actions: ["setPlaying", "clearRetries"],
              },
              { actions: ["setPlaying"] },
            ],
          },
          always: { guard: "canConnect", target: "active" },
        },

        active: {
          entry: ["clearError"],
          invoke: {
            src: "elementPlayback",
            input: ({ context }) => ({ url: context.url ?? "" }),
          },
          initial: "loading",
          states: {
            loading: {
              on: {
                ELEMENT_PLAYING: {
                  target: "playing",
                  actions: ["clearRetries", "emitPlaybackStarted"],
                },
              },
            },
            playing: {},
          },
          on: {
            // A live stream that ends has dropped out; retry like any failure.
            ELEMENT_ENDED: [
              { guard: "canRetry", target: "reconnecting", actions: ["countRetry"] },
              { target: "failed", actions: ["setError", "emitFailed"] },
            ],
            ELEMENT_ERROR: [
              {
                guard: "canRetry",
                target: "reconnecting",
                actions: ["setError", "countRetry"],
              },
              { target: "failed", actions: ["setError", "emitFailed"] },
            ],
          },
        },

        reconnecting: {
          after: {
            [RECONNECT_DELAY_MS]: [
              { guard: "canConnect", target: "active", reenter: true },
              { target: "idle" },
            ],
          },
        },

        failed: {
          on: {
            PLAY: [
              {
                guard: "hasUrl",
                target: "active",
                actions: ["setPlaying", "clearRetries"],
              },
              { actions: ["setPlaying"] },
            ],
          },
        },
      },
    },

    analysis: {
      initial: "off",
      states: {
        off: {
          always: { guard: "analysisWanted", target: "on" },
        },
        on: {
          invoke: {
            src: "analysisRun",
            input: ({ context }) => ({ url: context.url ?? "" }),
          },
          always: { guard: not("analysisWanted"), target: "off" },
          on: {
            ANALYSIS_CONNECTED: { actions: ["setResponse"] },
            ANALYSIS_STREAMING: { actions: ["clearAnalysisFailures"] },
            ANALYSIS_ENDED: { target: "cooldown", actions: ["countAnalysisFailure"] },
            ANALYSIS_ERROR: { target: "cooldown", actions: ["countAnalysisFailure"] },
          },
        },
        /** Never retry a dead analysis connection in a tight loop. */
        cooldown: {
          after: { [ANALYSIS_COOLDOWN_MS]: "off" },
        },
      },
    },
  },
})
