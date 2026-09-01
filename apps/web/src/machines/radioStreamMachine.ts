/**
 * Radio listen lifecycle (ADR 0139 / 0141 / MSE).
 *
 * The machine owns connection lifecycle; audible output belongs to either the MSE
 * transport or a plain `<audio>` element fallback. The oscilloscope reads aligned
 * PCM from the same bytes via `analysisTap` — no parallel analysis region.
 */

import { setup, assign, emit, fromCallback, type AnyEventObject } from "xstate"
import {
  ensureRadioPlaybackElement,
  playRadioPlayback,
  releaseRadioPlayback,
  setRadioPlaybackUrl,
} from "../lib/radioPlaybackElement"
import {
  ensureRadioMseElement,
  markRadioMsePlaying,
  playRadioMse,
  releaseRadioMse,
  startRadioMseStream,
  useMseRadioTransport,
} from "../lib/mse/radioMseTransport"

/** Element dropped the stream (server hiccup) — wait before reconnecting. */
const RECONNECT_DELAY_MS = 1200
/** Consecutive failures without reaching playback before we give up. */
const MAX_PLAYBACK_RETRIES = 3

export type RadioStreamContext = {
  url: string | null
  playing: boolean
  error: string | null
  retries: number
  /** MSE failed before playback — use plain element for the rest of the session. */
  mseRejected: boolean
}

export type RadioStreamEvent =
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | { type: "SET_URL"; url: string }
  /** Player unmounted — drop the stream and forget the url. */
  | { type: "TEARDOWN" }
  | { type: "ELEMENT_PLAYING" }
  | { type: "ELEMENT_ENDED" }
  | { type: "ELEMENT_ERROR"; message: string }
  | { type: "MSE_FALLBACK" }

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
    playbackRun: fromCallback<
      AnyEventObject,
      { url: string; mseRejected: boolean }
    >(({ input, sendBack }) => {
      let detach: (() => void) | null = null

      const attachElement = (el: HTMLAudioElement) => {
        const onPlaying = () => sendBack({ type: "ELEMENT_PLAYING" })
        const onEnded = () => sendBack({ type: "ELEMENT_ENDED" })
        const onError = () =>
          sendBack({ type: "ELEMENT_ERROR", message: mediaErrorMessage(el) })
        el.addEventListener("playing", onPlaying)
        el.addEventListener("ended", onEnded)
        el.addEventListener("error", onError)
        return () => {
          el.removeEventListener("playing", onPlaying)
          el.removeEventListener("ended", onEnded)
          el.removeEventListener("error", onError)
        }
      }

      const startElement = () => {
        setRadioPlaybackUrl(input.url)
        const el = ensureRadioPlaybackElement()
        if (!el) {
          sendBack({ type: "ELEMENT_ERROR", message: "noAudioElement" })
          return
        }
        detach?.()
        detach = attachElement(el)
        playRadioPlayback()
      }

      const startMse = () => {
        const el = ensureRadioMseElement()
        if (!el) {
          sendBack({ type: "MSE_FALLBACK" })
          startElement()
          return
        }
        const onPlaying = () => {
          markRadioMsePlaying()
          sendBack({ type: "ELEMENT_PLAYING" })
        }
        const onEnded = () => sendBack({ type: "ELEMENT_ENDED" })
        const onError = () =>
          sendBack({ type: "ELEMENT_ERROR", message: mediaErrorMessage(el) })
        el.addEventListener("playing", onPlaying)
        el.addEventListener("ended", onEnded)
        el.addEventListener("error", onError)
        detach = () => {
          el.removeEventListener("playing", onPlaying)
          el.removeEventListener("ended", onEnded)
          el.removeEventListener("error", onError)
          releaseRadioMse()
        }
        startRadioMseStream(input.url, {
          onFallbackBeforePlaying: () => {
            sendBack({ type: "MSE_FALLBACK" })
            releaseRadioMse()
            startElement()
          },
        })
        playRadioMse()
      }

      if (useMseRadioTransport(input.mseRejected)) startMse()
      else startElement()

      return () => {
        detach?.()
        detach = null
        releaseRadioPlayback()
        releaseRadioMse()
      }
    }),
  },
  guards: {
    canConnect: ({ context }) => context.playing && Boolean(context.url),
    hasUrl: ({ context }) => Boolean(context.url),
    canRetry: ({ context }) => context.retries < MAX_PLAYBACK_RETRIES,
  },
  actions: {
    setPlaying: assign({ playing: true }),
    clearPlaying: assign({ playing: false }),
    setUrl: assign({
      url: ({ event }) => (event.type === "SET_URL" ? event.url : null),
      error: null,
      retries: 0,
    }),
    clearError: assign({ error: null }),
    setError: assign({
      error: ({ event }) => (event.type === "ELEMENT_ERROR" ? event.message : "streamFailed"),
    }),
    countRetry: assign({ retries: ({ context }) => context.retries + 1 }),
    clearRetries: assign({ retries: 0, error: null }),
    rejectMse: assign({ mseRejected: true }),
    reset: assign({
      url: null,
      playing: false,
      error: null,
      retries: 0,
      mseRejected: false,
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
    error: null,
    retries: 0,
    mseRejected: false,
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
      id: "playbackActive",
      entry: ["clearError"],
      invoke: {
        src: "playbackRun",
        input: ({ context }) => ({
          url: context.url ?? "",
          mseRejected: context.mseRejected,
        }),
      },
      initial: "loading",
      states: {
        loading: {
          on: {
            ELEMENT_PLAYING: {
              target: "playing",
              actions: ["clearRetries", "emitPlaybackStarted"],
            },
            MSE_FALLBACK: { actions: ["rejectMse"] },
          },
        },
        playing: {
          on: {
            MSE_FALLBACK: { actions: ["rejectMse"] },
          },
        },
      },
      on: {
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
})
