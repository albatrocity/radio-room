import { Machine, assign } from "xstate"

// This machine is completely decoupled from React
export const audioMachine = Machine(
  {
    id: "audio",
    initial: "ready",
    type: "parallel",
    context: {
      volume: 1.0,
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
  {
    actions: {
      setVolume: assign((context, event) => ({
        volume: event.volume,
      })),
    },
    guards: {
      volumeAboveZero: (context, event) => parseFloat(event.volume) > 0,
      volumeIsZero: (context, event) => parseFloat(event.volume) === 0,
    },
  }
)
