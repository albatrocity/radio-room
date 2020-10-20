import { Machine, assign } from "xstate"
import socketService from "../lib/socketService"

export const audioMachine = Machine(
  {
    id: "audio",
    initial: "offline",
    context: {
      volume: 1.0,
      meta: {},
    },
    invoke: {
      src: (ctx, event) => socketService,
      onError: "willRetry",
    },
    states: {
      ready: {
        type: "parallel",
        on: {
          META: {
            actions: ["setMeta"],
          },
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
                on: { TOGGLE: "stopped" },
              },
              stopped: {
                on: { TOGGLE: "playing" },
              },
            },
          },
          cover: {
            initial: "found",
            states: {
              none: {},
              found: {},
            },
            on: {
              COVER_NOT_FOUND: ".none",
              TRY_COVER: ".found",
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
          ONLINE: "ready",
          INIT: { target: "ready", actions: ["setMeta"] },
          META: { target: "ready", actions: ["setMeta"] },
        },
      },
      willRetry: {
        after: { 2000: "offline" },
      },
    },
  },
  {
    actions: {
      setVolume: assign((context, event) => ({
        volume: event.volume,
      })),
      setMeta: assign((context, event) => {
        console.log("setMeta", event)
        if (event.hasOwnProperty("data")) {
          return { meta: event.data.meta }
        } else {
          return { meta: event.meta }
        }
      }),
    },
    guards: {
      volumeAboveZero: (context, event) => parseFloat(event.volume) > 0,
      volumeIsZero: (context, event) => parseFloat(event.volume) === 0,
    },
  }
)
