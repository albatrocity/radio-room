import { Machine, assign } from "xstate"
import socket from "../lib/socket"

export const audioMachine = Machine(
  {
    id: "audio",
    initial: "offline",
    context: {
      volume: 1.0,
      meta: {},
    },
    states: {
      ready: {
        type: "parallel",
        invoke: {
          src: _ => cb => {
            socket.on("meta", payload => {
              cb({ type: "SET_META", meta: payload })
              cb({ type: "TRY_COVER" })
            })
          },
          onError: "willRetry",
        },
        on: {
          SET_META: {
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
        invoke: {
          src: "pingOffline",
          onError: "willRetry",
          onDone: { target: "ready", actions: ["setMeta"] },
        },
        on: {
          ONLINE: "ready",
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
