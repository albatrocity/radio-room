import { createMachine, assign, sendTo } from "xstate"
import socketService from "../lib/socketService"
import { isEmpty, isNil } from "lodash/fp"
import { StationMeta } from "../types/StationMeta"

interface Context {
  volume: number
  meta?: StationMeta
  participationStatus: "listening" | "participating"
}

export const audioMachine = createMachine<Context>(
  {
    predictableActionArguments: true,
    id: "audio",
    initial: "offline",
    context: {
      volume: 1.0,
      meta: {},
      participationStatus: "participating",
    },
    invoke: {
      id: "socket",
      src: () => socketService,
      onError: "willRetry",
    },
    states: {
      online: {
        type: "parallel",
        on: {
          INIT: {
            actions: ["setMeta"],
          },
          OFFLINE: "offline",
          META: {
            actions: ["setMeta"],
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
                  TOGGLE: {
                    target: "stopped",
                    actions: ["stopListening", "participate"],
                  },
                  META: [
                    {
                      target: "playing.loaded",
                      actions: ["setMeta"],
                      cond: "hasBitrate",
                    },
                    {
                      target: "#audio.offline",
                      actions: ["setMeta", "participate", "stopListening"],
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
                  META: [
                    {
                      target: "stopped",
                      actions: ["setMeta"],
                      cond: "hasBitrate",
                    },
                    { target: "#audio.offline", actions: ["setMeta"] },
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
            { target: "online", actions: ["setMeta"], cond: "hasBitrate" },
            { target: "offline", actions: ["setMeta"] },
          ],
          META: [
            { target: "online", actions: ["setMeta"], cond: "hasBitrate" },
            { target: "offline", actions: ["setMeta"] },
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
      startListening: sendTo("socket", () => ({
        type: "start listening",
      })),
      listen: assign({
        participationStatus: "listening",
      }),
      participate: assign({
        participationStatus: "participating",
      }),
      stopListening: sendTo("socket", () => ({
        type: "stop listening",
      })),
    },
    guards: {
      volumeAboveZero: (_context, event) => parseFloat(event.volume) > 0,
      volumeIsZero: (_context, event) => parseFloat(event.volume) === 0,
      hasBitrate: (_context, event) => {
        return !isEmpty(event.data.meta) && !isNil(event.data.meta.bitrate)
      },
    },
  },
)
