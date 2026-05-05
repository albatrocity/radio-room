import { setup, assign } from "xstate"
import { isEmpty, isNil } from "lodash/fp"
import { RoomMeta } from "../types/Room"
import { emitToSocket, subscribeById, unsubscribeById } from "../actors/socketActor"
import { getListeningAudioTransportForSocket } from "../lib/listeningAudioTransportPreference"
import { QueueItem } from "../types/Queue"

// ============================================================================
// Types
// ============================================================================

export interface AudioContext {
  volume: number
  /** Partial: socket payloads may omit fields such as `stationMeta`. */
  meta?: Partial<RoomMeta>
  mediaSourceStatus: "online" | "offline" | "connecting" | "unknown"
  /** Hybrid radio: MediaMTX / experimental WebRTC path (stream health webhook). */
  webrtcExperimentalStreamStatus: "online" | "offline" | "unknown"
  participationStatus: "listening" | "participating"
  subscriptionId: string | null
  /** Live/radio: media element is ready while user is still stopped (LOADED/PLAY arrived before TOGGLE). */
  streamBufferReady: boolean
}

type AudioEvent =
  | { type: "ACTIVATE" }
  | { type: "DEACTIVATE" }
  | {
      type: "INIT"
      data: {
        meta: RoomMeta
        streamHealthStatus?: "online" | "offline"
        webrtcStreamHealthStatus?: "online" | "offline"
      }
    }
  | { type: "OFFLINE" }
  | { type: "ONLINE" }
  | { type: "TRACK_CHANGED"; data: { meta: RoomMeta } }
  | {
      type: "MEDIA_SOURCE_STATUS_CHANGED"
      data: {
        status: "online" | "offline" | "connecting" | "unknown"
        streamTransport?: "shoutcast" | "webrtc"
      }
    }
  | {
      type: "STREAM_HEALTH_CHANGED"
      data: { roomId: string; status: "online" | "offline"; ingest?: "webrtc_experimental" }
    }
  | { type: "ROOM_SETTINGS_UPDATED"; data: { pluginConfigs?: Record<string, unknown> } }
  | { type: "PLAYLIST_TRACK_UPDATED"; data: { track: QueueItem } }
  | { type: "LOADED" }
  | { type: "PLAY" }
  | { type: "STOP" }
  | { type: "TOGGLE" }
  | { type: "TOGGLE_MUTE" }
  | { type: "CHANGE_VOLUME"; volume: number }

// ============================================================================
// Machine
// ============================================================================

let subscriptionCounter = 0

const defaultContext: AudioContext = {
  volume: 1.0,
  meta: undefined,
  mediaSourceStatus: "unknown",
  webrtcExperimentalStreamStatus: "unknown",
  participationStatus: "participating",
  subscriptionId: null,
  streamBufferReady: false,
}

export const audioMachine = setup({
  types: {
    context: {} as AudioContext,
    events: {} as AudioEvent,
  },
  actions: {
    subscribe: assign(({ self }) => {
      const id = `audio-${self.id}-${++subscriptionCounter}`
      subscribeById(id, { send: (event) => self.send(event as AudioEvent) })
      return { subscriptionId: id }
    }),
    unsubscribe: ({ context }) => {
      if (context.subscriptionId) {
        unsubscribeById(context.subscriptionId)
      }
    },
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
    clearDisabledPluginDataFromNowPlaying: assign(({ context, event }) => {
      if (event.type !== "ROOM_SETTINGS_UPDATED" || !event.data.pluginConfigs) return {}
      if (!context.meta?.nowPlaying?.pluginData) return {}

      const disabledPlugins = new Set<string>()
      for (const [name, config] of Object.entries(event.data.pluginConfigs)) {
        if ((config as { enabled?: boolean } | undefined)?.enabled !== true) {
          disabledPlugins.add(name)
        }
      }

      if (disabledPlugins.size === 0) return {}

      const cleanedPluginData = { ...context.meta.nowPlaying.pluginData }
      for (const pluginName of disabledPlugins) {
        delete cleanedPluginData[pluginName]
      }

      return {
        meta: {
          ...context.meta,
          nowPlaying: {
            ...context.meta.nowPlaying,
            pluginData: Object.keys(cleanedPluginData).length > 0 ? cleanedPluginData : undefined,
          },
        },
      }
    }),
    setMediaSourceStatus: assign(({ event }) => {
      if (event.type !== "MEDIA_SOURCE_STATUS_CHANGED") return {}
      if (event.data.streamTransport === "webrtc") {
        const s = event.data.status
        return {
          webrtcExperimentalStreamStatus:
            s === "online" ? ("online" as const) : ("offline" as const),
        }
      }
      return { mediaSourceStatus: event.data.status }
    }),
    applyStreamHealth: assign(({ event }) => {
      if (event.type !== "STREAM_HEALTH_CHANGED") return {}
      if (event.data.ingest === "webrtc_experimental") {
        return { webrtcExperimentalStreamStatus: event.data.status }
      }
      return {}
    }),
    setStatusFromMeta: assign(({ event }) => {
      const patch: Partial<AudioContext> = {}
      if (!("data" in event) || !event.data) return patch
      const d = event.data as {
        streamHealthStatus?: "online" | "offline"
        webrtcStreamHealthStatus?: "online" | "offline"
        meta?: RoomMeta
      }
      if (d.streamHealthStatus) {
        patch.mediaSourceStatus = d.streamHealthStatus
      } else if (d.meta?.nowPlaying) {
        patch.mediaSourceStatus = "online"
      } else {
        patch.mediaSourceStatus = "offline"
      }
      if (d.webrtcStreamHealthStatus === "online" || d.webrtcStreamHealthStatus === "offline") {
        patch.webrtcExperimentalStreamStatus = d.webrtcStreamHealthStatus
      }
      return patch
    }),
    setStatusOnline: assign({
      mediaSourceStatus: "online" as const,
    }),
    startListening: () => {
      emitToSocket("START_LISTENING", {
        audioTransport: getListeningAudioTransportForSocket(),
      })
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
    resetAudio: assign(() => defaultContext),
    setStreamBufferReady: assign({ streamBufferReady: true }),
    clearStreamBufferReady: assign({ streamBufferReady: false }),
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
      if ("data" in event && "streamHealthStatus" in event.data && event.data.streamHealthStatus === "online") {
        return true
      }
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
    isStreamBufferReady: ({ context }) => context.streamBufferReady,
  },
}).createMachine({
  id: "audio",
  initial: "idle",
  context: defaultContext,
  states: {
    // Idle state - not subscribed to socket events
    idle: {
      on: {
        ACTIVATE: "active",
      },
    },
    // Active state - subscribed to socket events
    active: {
      entry: ["subscribe"],
      exit: ["unsubscribe"],
      on: {
        DEACTIVATE: {
          target: "idle",
          actions: ["resetAudio"],
        },
        ROOM_SETTINGS_UPDATED: {
          actions: ["clearDisabledPluginDataFromNowPlaying"],
        },
      },
      initial: "offline",
      states: {
        online: {
          type: "parallel",
          on: {
            INIT: {
              actions: ["setMeta", "setStatusFromMeta"],
            },
            OFFLINE: "offline",
            STREAM_HEALTH_CHANGED: {
              actions: ["applyStreamHealth"],
            },
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
                      actions: ["stopListening", "participate", "clearStreamBufferReady"],
                    },
                    TOGGLE: {
                      target: "stopped",
                      actions: ["stopListening", "participate", "clearStreamBufferReady"],
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
                        target: "#audio.active.offline",
                        actions: ["setMediaSourceStatus", "participate", "stopListening"],
                      },
                    ],
                  },
                },
                stopped: {
                  on: {
                    // Idempotent cleanup when swapping transport or unmounting a player while
                    // already stopped (e.g. WebRTC signaled LOADED but user never pressed play).
                    STOP: {
                      actions: ["clearStreamBufferReady"],
                    },
                    LOADED: {
                      actions: ["setStreamBufferReady"],
                    },
                    PLAY: {
                      actions: ["setStreamBufferReady"],
                    },
                    TOGGLE: [
                      {
                        target: "playing.loaded",
                        guard: "isStreamBufferReady",
                        actions: ["listen", "startListening"],
                      },
                      {
                        target: "playing",
                        actions: ["listen", "startListening"],
                      },
                    ],
                    TRACK_CHANGED: {
                      actions: ["setMeta"],
                    },
                    MEDIA_SOURCE_STATUS_CHANGED: [
                      {
                        target: "stopped",
                        actions: ["setMediaSourceStatus"],
                        guard: "statusIsOnline",
                      },
                      { target: "#audio.active.offline", actions: ["setMediaSourceStatus"] },
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
          entry: ["clearStreamBufferReady"],
          on: {
            STREAM_HEALTH_CHANGED: {
              actions: ["applyStreamHealth"],
            },
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
          on: {
            STREAM_HEALTH_CHANGED: {
              actions: ["applyStreamHealth"],
            },
          },
          after: { 2000: "online" },
        },
      },
    },
  },
})
