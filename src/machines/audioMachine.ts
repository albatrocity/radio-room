import { createMachine, assign, send } from "xstate"
import socketService from "../lib/socketService"
import { isEmpty, isNil } from "lodash/fp"
import { StationMeta } from "../types/StationMeta"

interface Context {
  volume: number
  meta?: StationMeta
}

export const audioMachine = createMachine<Context>(
  {
    predictableActionArguments: true,
    id: "audio",
    initial: "offline",
    context: {
      volume: 1.0,
      meta: {},
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
        },
        states: {
          progress: {
            initial: "stopped",
            states: {
              playing: {
                entry: ["startListening"],
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
                  TOGGLE: "stopped",
                  META: [
                    {
                      target: "playing.loaded",
                      actions: ["setMeta"],
                      cond: "hasBitrate",
                    },
                    { target: "#audio.offline", actions: ["setMeta"] },
                  ],
                },
              },
              stopped: {
                entry: ["stopListening"],
                on: {
                  TOGGLE: "playing",
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
      startListening: send(
        (ctx) => ({
          type: "start listening",
        }),
        {
          to: "socket",
        },
      ),
      stopListening: send(
        (ctx) => ({
          type: "stop listening",
        }),
        {
          to: "socket",
        },
      ),
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
