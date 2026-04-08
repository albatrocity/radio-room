import { setup, assign, log } from "xstate"

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
          entry: log("[transport] webrtc.signaling"),
          on: {
            WHEP_OK: { target: "iceConnecting", actions: log("[transport] WHEP_OK → iceConnecting") },
            WHEP_FAILED: { target: "#liveTransport.webrtcFailed", actions: log("[transport] WHEP_FAILED → webrtcFailed") },
          },
        },

        iceConnecting: {
          entry: log("[transport] webrtc.iceConnecting"),
          after: { 10000: { target: "#liveTransport.webrtcFailed", actions: log("[transport] ICE timeout → webrtcFailed") } },
          on: {
            ICE_CONNECTED: { target: "playing", actions: log("[transport] ICE_CONNECTED → playing") },
            ICE_COMPLETED: { target: "playing", actions: log("[transport] ICE_COMPLETED → playing") },
            TRACK_RECEIVED: { target: "playing", actions: log("[transport] TRACK_RECEIVED → playing") },
            ICE_FAILED: { target: "#liveTransport.webrtcFailed", actions: log("[transport] ICE_FAILED → webrtcFailed") },
          },
        },

        playing: {
          entry: ["markWebRTC", log("[transport] webrtc.playing — WebRTC active")],
          on: {
            ICE_DISCONNECTED: { target: "disconnectedGrace", actions: log("[transport] ICE_DISCONNECTED → grace period") },
            ICE_FAILED: { target: "#liveTransport.webrtcFailed", actions: log("[transport] ICE_FAILED while playing → webrtcFailed") },
          },
        },

        disconnectedGrace: {
          entry: log("[transport] webrtc.disconnectedGrace (5s before giving up)"),
          after: { 5000: { target: "#liveTransport.webrtcFailed", actions: log("[transport] grace expired → webrtcFailed") } },
          on: {
            ICE_CONNECTED: { target: "playing", actions: log("[transport] ICE recovered → playing") },
            ICE_COMPLETED: { target: "playing", actions: log("[transport] ICE recovered (completed) → playing") },
            ICE_FAILED: { target: "#liveTransport.webrtcFailed", actions: log("[transport] ICE_FAILED during grace → webrtcFailed") },
          },
        },
      },
    },

    // DEBUG: dead-end state instead of HLS fallback so we can see where WebRTC fails
    webrtcFailed: {
      entry: log("[transport] *** WEBRTC FAILED — stuck here (HLS fallback disabled for debugging) ***"),
    },

    hls: {
      entry: "markHLS",
    },
  },
})
