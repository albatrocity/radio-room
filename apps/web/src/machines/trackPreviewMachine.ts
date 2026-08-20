import { assign, setup } from "xstate"
import { Howl } from "howler"
import { emitToSocket, subscribeById, unsubscribeById } from "../actors/socketActor"
import { audioActor, getVolume } from "../actors/audioActor"
import { resolvePreviewClipUrl } from "../lib/previewClipUrl"

export type TrackPreviewStatus = "idle" | "loading" | "playing"

export interface TrackPreviewContext {
  trackKey: string | null
  status: TrackPreviewStatus
  howl: Howl | null
  subscriptionId: string | null
}

type TrackPreviewEvent =
  | { type: "ACTIVATE" }
  | { type: "DEACTIVATE" }
  | {
      type: "TOGGLE_PREVIEW"
      trackKey: string
      trackId: string
      mediaKey?: string
      source?: string
    }
  | { type: "STOP_PREVIEW" }
  | {
      type: "GET_TRACK_PREVIEW_RESULTS"
      data: { url: string; durationMs: number; cached?: boolean }
    }
  | { type: "GET_TRACK_PREVIEW_FAILURE"; data: { message: string } }
  | { type: "PREVIEW_ENDED" }
  | { type: "PREVIEW_ERROR" }

let subscriptionCounter = 0

const defaultContext: TrackPreviewContext = {
  trackKey: null,
  status: "idle",
  howl: null,
  subscriptionId: null,
}

function previewVolume(): number {
  const volume = getVolume()
  return volume > 0 ? volume : 0.7
}

function unloadHowl(howl: Howl | null) {
  if (!howl) return
  try {
    howl.stop()
    howl.unload()
  } catch {
    /* ignore */
  }
}

export const trackPreviewMachine = setup({
  types: {
    context: {} as TrackPreviewContext,
    events: {} as TrackPreviewEvent,
  },
  actions: {
    subscribe: assign(({ self }) => {
      const id = `trackPreview-${self.id}-${++subscriptionCounter}`
      subscribeById(id, {
        send: (event) => self.send(event as TrackPreviewEvent),
        eventTypes: ["GET_TRACK_PREVIEW_RESULTS", "GET_TRACK_PREVIEW_FAILURE"],
      })
      return { subscriptionId: id }
    }),
    unsubscribe: ({ context }) => {
      if (context.subscriptionId) {
        unsubscribeById(context.subscriptionId)
      }
    },
    requestPreview: assign(({ context, event }) => {
      if (event.type !== "TOGGLE_PREVIEW") return {}
      unloadHowl(context.howl)
      audioActor.send({ type: "END_PREVIEW" })
      const payload = {
        trackId: event.trackId,
        ...(event.mediaKey ? { mediaKey: event.mediaKey } : {}),
        ...(event.source ? { source: event.source } : {}),
      }
      // Defer emit so entry subscribe runs first when transitioning idle → active.
      queueMicrotask(() => {
        emitToSocket("GET_TRACK_PREVIEW", payload)
      })
      return {
        trackKey: event.trackKey,
        status: "loading" as const,
        howl: null,
      }
    }),
    stopPreview: assign(({ context }) => {
      unloadHowl(context.howl)
      audioActor.send({ type: "END_PREVIEW" })
      return { trackKey: null, status: "idle" as const, howl: null }
    }),
    playPreview: assign(({ context, event, self }) => {
      if (event.type !== "GET_TRACK_PREVIEW_RESULTS") return {}
      unloadHowl(context.howl)
      const url = resolvePreviewClipUrl(event.data.url)
      let started = false
      const sound = new Howl({
        src: [url],
        html5: true,
        volume: previewVolume(),
        format: ["mp3"],
        onplay: () => {
          if (started) return
          started = true
          audioActor.send({ type: "START_PREVIEW" })
        },
        onend: () => {
          self.send({ type: "PREVIEW_ENDED" })
        },
        onloaderror: (_id, err) => {
          console.error("[TrackPreview] Failed to load clip:", url, err)
          self.send({ type: "PREVIEW_ERROR" })
        },
        onplayerror: (_id, err) => {
          console.error("[TrackPreview] Failed to play clip:", url, err)
          self.send({ type: "PREVIEW_ERROR" })
        },
      })
      sound.once("load", () => {
        sound.play()
      })
      sound.load()
      return { status: "playing" as const, howl: sound }
    }),
    clearAfterFailure: assign(({ context }) => {
      unloadHowl(context.howl)
      audioActor.send({ type: "END_PREVIEW" })
      return { trackKey: null, status: "idle" as const, howl: null }
    }),
    reset: assign(({ context }) => {
      unloadHowl(context.howl)
      audioActor.send({ type: "END_PREVIEW" })
      return defaultContext
    }),
  },
  guards: {
    isSamePlayingTrack: ({ context, event }) =>
      event.type === "TOGGLE_PREVIEW" &&
      context.trackKey === event.trackKey &&
      context.status === "playing",
  },
}).createMachine({
  id: "trackPreview",
  initial: "idle",
  context: defaultContext,
  states: {
    idle: {
      on: {
        ACTIVATE: "active",
        TOGGLE_PREVIEW: {
          target: "active",
          actions: ["requestPreview"],
        },
      },
    },
    active: {
      entry: ["subscribe"],
      exit: ["unsubscribe", "reset"],
      on: {
        DEACTIVATE: "idle",
        TOGGLE_PREVIEW: [
          {
            guard: "isSamePlayingTrack",
            actions: ["stopPreview"],
          },
          {
            actions: ["requestPreview"],
          },
        ],
        STOP_PREVIEW: {
          actions: ["stopPreview"],
        },
        GET_TRACK_PREVIEW_RESULTS: {
          actions: ["playPreview"],
        },
        GET_TRACK_PREVIEW_FAILURE: {
          actions: ["clearAfterFailure"],
        },
        PREVIEW_ENDED: {
          actions: ["stopPreview"],
        },
        PREVIEW_ERROR: {
          actions: ["clearAfterFailure"],
        },
      },
    },
  },
})
