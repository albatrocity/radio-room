import { setup, assign } from "xstate"
import { isEmpty, isNil } from "lodash/fp"
import { RoomMeta } from "../types/Room"
import { emitToSocket } from "../actors/socketActor"
import { QueueItem } from "../types/Queue"

interface Context {
  volume: number
  meta?: RoomMeta
  mediaSourceStatus: "online" | "offline" | "connecting" | "unknown"
  participationStatus: "listening" | "participating"
}

type AudioEvent =
  | { type: "INIT"; data: { meta: RoomMeta } }
  | { type: "OFFLINE" }
  | { type: "ONLINE" }
  | { type: "TRACK_CHANGED"; data: { meta: RoomMeta } }
  | { type: "MEDIA_SOURCE_STATUS_CHANGED"; data: { status: "online" | "offline" | "connecting" | "unknown" } }
  | { type: "PLAYLIST_TRACK_UPDATED"; data: { track: QueueItem } }
  | { type: "LOADED" }
  | { type: "PLAY" }
  | { type: "STOP" }
  | { type: "TOGGLE" }
  | { type: "TOGGLE_MUTE" }
  | { type: "CHANGE_VOLUME"; volume: number }

export const audioMachine = setup({
  types: {
    context: {} as Context,
    events: {} as AudioEvent,
  },
  actions: {
    setVolume: assign(({ event }) => ({
      volume: (event as { volume: number }).volume,
    })),
    setMeta: assign(({ event }) => {
      if ("data" in event && "meta" in event.data) {
        return { meta: event.data.meta }
      }
      return {}
    }),
    updateNowPlaying: assign(({ context, event }) => {
      if (event.type === "PLAYLIST_TRACK_UPDATED") {
        return {
          meta: {
            ...context.meta,
            nowPlaying: event.data.track,
          },
        }
      }
      return {}
    }),
    setMediaSourceStatus: assign(({ event }) => {
      if (event.type === "MEDIA_SOURCE_STATUS_CHANGED") {
        return { mediaSourceStatus: event.data.status }
      }
      return {}
    }),
    setStatusFromMeta: assign(({ event }) => {
      // For INIT event, infer status from whether we have track data
      if ("data" in event && event.data.meta?.nowPlaying) {
        return { mediaSourceStatus: "online" as const }
      }
      return { mediaSourceStatus: "offline" as const }
    }),
    setStatusOnline: assign({
      mediaSourceStatus: "online" as const,
    }),
    startListening: () => {
      emitToSocket("START_LISTENING", {})
    },
    listen: assign({
      participationStatus: "listening" as const,
    }),
    participate: assign({
      participationStatus: "participating" as const,
    }),
    stopListening: () => {
      emitToSocket("STOP_LISTENING", {})
    },
  },
  guards: {
    volumeAboveZero: ({ event }) => {
      if (event.type === "CHANGE_VOLUME") {
        return parseFloat(String(event.volume)) > 0
      }
      return false
    },
    volumeIsZero: ({ event }) => {
      if (event.type === "CHANGE_VOLUME") {
        return parseFloat(String(event.volume)) === 0
      }
      return false
    },
    hasTrack: ({ event }) => {
      if ("data" in event && "meta" in event.data) {
        return !isEmpty(event.data.meta) && !isNil(event.data.meta.nowPlaying)
      }
      return false
    },
    eventHasTrack: ({ event }) => {
      return (
        event.type === "TRACK_CHANGED" &&
        !isEmpty(event.data.meta) &&
        !isNil(event.data.meta.nowPlaying)
      )
    },
    statusIsOnline: ({ event }) => {
      return event.type === "MEDIA_SOURCE_STATUS_CHANGED" && event.data.status === "online"
    },
    isCurrentTrack: ({ context, event }) => {
      return (
        event.type === "PLAYLIST_TRACK_UPDATED" &&
        !!context.meta?.nowPlaying &&
        context.meta.nowPlaying.mediaSource.trackId === event.data.track.mediaSource.trackId
      )
    },
  },
}).createMachine({
  id: "audio",
  initial: "offline",
  context: {
    volume: 1.0,
    meta: undefined,
    mediaSourceStatus: "unknown",
    participationStatus: "participating",
  },
  states: {
    online: {
      type: "parallel",
      on: {
        INIT: {
          actions: ["setMeta", "setStatusFromMeta"],
        },
        OFFLINE: "offline",
        TRACK_CHANGED: {
          actions: ["setMeta"],
        },
        MEDIA_SOURCE_STATUS_CHANGED: {
          actions: ["setMediaSourceStatus"],
        },
        PLAYLIST_TRACK_UPDATED: {
          actions: ["updateNowPlaying"],
          guard: "isCurrentTrack",
        },
      },
      states: {
        progress: {
          initial: "stopped",
          states: {
            playing: {
              initial: "loading",
              states: {
                loading: {
                  on: {
                    LOADED: "loaded",
                    PLAY: "loaded",
                  },
                },
                loaded: {},
              },
              on: {
                STOP: {
                  target: "stopped",
                  actions: ["stopListening", "participate"],
                },
                TOGGLE: {
                  target: "stopped",
                  actions: ["stopListening", "participate"],
                },
                TRACK_CHANGED: {
                  actions: ["setMeta"],
                },
                MEDIA_SOURCE_STATUS_CHANGED: [
                  {
                    target: "playing.loaded",
                    actions: ["setMediaSourceStatus"],
                    guard: "statusIsOnline",
                  },
                  {
                    target: "#audio.offline",
                    actions: ["setMediaSourceStatus", "participate", "stopListening"],
                  },
                ],
              },
            },
            stopped: {
              on: {
                TOGGLE: {
                  target: "playing",
                  actions: ["listen", "startListening"],
                },
                TRACK_CHANGED: {
                  actions: ["setMeta"],
                },
                MEDIA_SOURCE_STATUS_CHANGED: [
                  {
                    target: "stopped",
                    actions: ["setMediaSourceStatus"],
                    guard: "statusIsOnline",
                  },
                  { target: "#audio.offline", actions: ["setMediaSourceStatus"] },
                ],
              },
            },
          },
        },
        volume: {
          initial: "unmuted",
          states: {
            muted: {
              on: {
                TOGGLE_MUTE: "unmuted",
                CHANGE_VOLUME: [
                  {
                    actions: ["setVolume"],
                    target: "unmuted",
                    guard: "volumeAboveZero",
                  },
                  {
                    actions: ["setVolume"],
                  },
                ],
              },
            },
            unmuted: {
              on: {
                TOGGLE_MUTE: "muted",
                CHANGE_VOLUME: [
                  {
                    actions: ["setVolume"],
                    target: "muted",
                    guard: "volumeIsZero",
                  },
                  {
                    actions: ["setVolume"],
                  },
                ],
              },
            },
          },
        },
      },
    },
    offline: {
      on: {
        ONLINE: "online",
        INIT: [
          { target: "online", actions: ["setMeta", "setStatusFromMeta"], guard: "hasTrack" },
          { target: "offline", actions: ["setMeta", "setStatusFromMeta"] },
        ],
        TRACK_CHANGED: [
          // If we receive track data while offline, go online
          { target: "online", actions: ["setMeta", "setStatusOnline"], guard: "eventHasTrack" },
          { actions: ["setMeta"] },
        ],
        MEDIA_SOURCE_STATUS_CHANGED: [
          { target: "online", actions: ["setMediaSourceStatus"], guard: "statusIsOnline" },
          { target: "offline", actions: ["setMediaSourceStatus"] },
        ],
      },
    },
    willRetry: {
      after: { 2000: "online" },
    },
  },
})
