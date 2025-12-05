import { createMachine, assign } from "xstate"
import { isEmpty, isNil } from "lodash/fp"
import { RoomMeta } from "../types/Room"
import { emitToSocket } from "../actors/socketActor"

interface Context {
  volume: number
  meta?: RoomMeta
  mediaSourceStatus: "online" | "offline" | "connecting" | "unknown"
  participationStatus: "listening" | "participating"
}

export const audioMachine = createMachine<Context>(
  {
    predictableActionArguments: true,
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
            cond: "isCurrentTrack",
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
                    actions: ["STOP_LISTENING", "participate"],
                  },
                  TOGGLE: {
                    target: "stopped",
                    actions: ["STOP_LISTENING", "participate"],
                  },
                  TRACK_CHANGED: {
                    actions: ["setMeta"],
                  },
                  MEDIA_SOURCE_STATUS_CHANGED: [
                    {
                      target: "playing.loaded",
                      actions: ["setMediaSourceStatus"],
                      cond: "statusIsOnline",
                    },
                    {
                      target: "#audio.offline",
                      actions: ["setMediaSourceStatus", "participate", "STOP_LISTENING"],
                    },
                  ],
                },
              },
              stopped: {
                on: {
                  TOGGLE: {
                    target: "playing",
                    actions: ["listen", "START_LISTENING"],
                  },
                  TRACK_CHANGED: {
                    actions: ["setMeta"],
                  },
                  MEDIA_SOURCE_STATUS_CHANGED: [
                    {
                      target: "stopped",
                      actions: ["setMediaSourceStatus"],
                      cond: "statusIsOnline",
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
                      cond: "volumeAboveZero",
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
                      cond: "volumeIsZero",
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
            { target: "online", actions: ["setMeta", "setStatusFromMeta"], cond: "hasTrack" },
            { target: "offline", actions: ["setMeta", "setStatusFromMeta"] },
          ],
          TRACK_CHANGED: [
            // If we receive track data while offline, go online
            { target: "online", actions: ["setMeta", "setStatusOnline"], cond: "eventHasTrack" },
            { actions: ["setMeta"] },
          ],
          MEDIA_SOURCE_STATUS_CHANGED: [
            { target: "online", actions: ["setMediaSourceStatus"], cond: "statusIsOnline" },
            { target: "offline", actions: ["setMediaSourceStatus"] },
          ],
        },
      },
      willRetry: {
        after: { 2000: "online" },
      },
    },
  },
  {
    actions: {
      setVolume: assign((_context, event) => ({
        volume: event.volume,
      })),
      setMeta: assign((_context, event) => {
        return { meta: event.data.meta }
      }),
      updateNowPlaying: assign((context, event) => ({
        meta: {
          ...context.meta,
          nowPlaying: event.data.track,
        },
      })),
      setMediaSourceStatus: assign((_context, event) => {
        if (event.type === "MEDIA_SOURCE_STATUS_CHANGED") {
          return { mediaSourceStatus: event.data.status }
        }
        return {}
      }),
      setStatusFromMeta: assign((_context, event) => {
        // For INIT event, infer status from whether we have track data
        if (event.data.meta?.nowPlaying) {
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
        participationStatus: "listening",
      }),
      participate: assign({
        participationStatus: "participating",
      }),
      stopListening: () => {
        emitToSocket("STOP_LISTENING", {})
      },
    },
    guards: {
      volumeAboveZero: (_context, event) => parseFloat(event.volume) > 0,
      volumeIsZero: (_context, event) => parseFloat(event.volume) === 0,
      hasTrack: (_context, event) => {
        // Check if we have actual playback data (works for both jukebox and radio)
        return !isEmpty(event.data.meta) && !isNil(event.data.meta.nowPlaying)
      },
      eventHasTrack: (_context, event) => {
        // Check if TRACK_CHANGED event has track data
        return (
          event.type === "TRACK_CHANGED" &&
          !isEmpty(event.data.meta) &&
          !isNil(event.data.meta.nowPlaying)
        )
      },
      statusIsOnline: (_context, event) => {
        return event.type === "MEDIA_SOURCE_STATUS_CHANGED" && event.data.status === "online"
      },
      isCurrentTrack: (context, event) => {
        return (
          event.type === "PLAYLIST_TRACK_UPDATED" &&
          !!context.meta?.nowPlaying &&
          context.meta.nowPlaying.mediaSource.trackId === event.data.track.mediaSource.trackId
        )
      },
    },
  },
)
