import { setup, assign } from "xstate"

export type LiveTransportEvent =
  | { type: "WHEP_OK" }
  | { type: "WHEP_FAILED" }
  | { type: "ICE_CONNECTED" }
  | { type: "ICE_COMPLETED" }
  | { type: "ICE_DISCONNECTED" }
  | { type: "ICE_FAILED" }
  | { type: "TRACK_RECEIVED" }

export const liveTransportMachine = setup({
  types: {
    context: {} as {
      transport: "webrtc" | "hls" | "none"
      hasWhepUrl: boolean
    },
    events: {} as LiveTransportEvent,
    input: {} as { hasWhepUrl: boolean },
  },
  guards: {
    hasWhep: ({ context }) => context.hasWhepUrl,
  },
  actions: {
    markWebRTC: assign({ transport: "webrtc" as const }),
    markHLS: assign({ transport: "hls" as const }),
  },
}).createMachine({
  id: "liveTransport",
  initial: "deciding",
  context: ({ input }) => ({
    transport: "none" as const,
    hasWhepUrl: input.hasWhepUrl,
  }),
  states: {
    deciding: {
      always: [
        { target: "webrtc", guard: "hasWhep" },
        { target: "hls" },
      ],
    },

    webrtc: {
      initial: "signaling",
      states: {
        signaling: {
          on: {
            WHEP_OK: "iceConnecting",
            WHEP_FAILED: "#liveTransport.hls",
          },
        },

        iceConnecting: {
          after: { 10000: "#liveTransport.hls" },
          on: {
            ICE_CONNECTED: "playing",
            ICE_COMPLETED: "playing",
            TRACK_RECEIVED: "playing",
            ICE_FAILED: "#liveTransport.hls",
          },
        },

        playing: {
          entry: "markWebRTC",
          on: {
            ICE_DISCONNECTED: "disconnectedGrace",
            ICE_FAILED: "#liveTransport.hls",
          },
        },

        disconnectedGrace: {
          after: { 5000: "#liveTransport.hls" },
          on: {
            ICE_CONNECTED: "playing",
            ICE_COMPLETED: "playing",
            ICE_FAILED: "#liveTransport.hls",
          },
        },
      },
    },

    hls: {
      entry: "markHLS",
    },
  },
})
