import { setup, assign } from "xstate"
import { Room } from "../types/Room"
import { emitToSocket, subscribeById, unsubscribeById } from "../actors/socketActor"

// ============================================================================
// Types
// ============================================================================

export type SettingsContext = Pick<
  Room,
  | "title"
  | "fetchMeta"
  | "extraInfo"
  | "password"
  | "artwork"
  | "artworkStreamingOnly"
  | "deputizeOnJoin"
  | "enableSpotifyLogin"
  | "type"
  | "radioMetaUrl"
  | "radioListenUrl"
  | "radioProtocol"
  | "liveIngestEnabled"
  | "liveWhepUrl"
  | "liveHlsUrl"
  | "announceUsernameChanges"
  | "announceNowPlaying"
  | "allowChatImages"
  | "showId"
  | "activeSegmentId"
  | "activeShowSegmentId"
  | "showSchedulePublic"
  | "announceActiveSegment"
  | "public"
  | "playbackControllerId"
> & {
  /** Generic plugin configs keyed by plugin name */
  pluginConfigs: Record<string, Record<string, unknown>>
  subscriptionId: string | null
}

type SettingsEvent =
  | { type: "ACTIVATE" }
  | { type: "DEACTIVATE" }
  | { type: "FETCH" }
  | {
      type: "INIT"
      data: { pluginConfigs?: Record<string, Record<string, unknown>> }
    }
  | {
      type: "ROOM_SETTINGS"
      data: { room: Room; pluginConfigs?: Record<string, Record<string, unknown>> }
    }
  | {
      type: "ROOM_SETTINGS_UPDATED"
      data: { roomId: string; room: Room; pluginConfigs?: Record<string, Record<string, unknown>> }
    }
  | { type: "SUBMIT"; target: "pending" }

// ============================================================================
// Machine
// ============================================================================

let subscriptionCounter = 0

const defaultContext: SettingsContext = {
  announceUsernameChanges: true,
  announceNowPlaying: true,
  allowChatImages: false,
  announceActiveSegment: false,
  showSchedulePublic: false,
  public: true,
  showId: undefined,
  activeSegmentId: undefined,
  activeShowSegmentId: undefined,
  title: "",
  fetchMeta: true,
  extraInfo: "",
  password: "",
  artwork: undefined,
  artworkStreamingOnly: false,
  deputizeOnJoin: false,
  enableSpotifyLogin: false,
  type: "jukebox",
  radioMetaUrl: "",
  radioListenUrl: "",
  liveIngestEnabled: false,
  liveWhepUrl: "",
  liveHlsUrl: "",
  playbackControllerId: undefined,
  pluginConfigs: {},
  subscriptionId: null,
}

export const settingsMachine = setup({
  types: {
    context: {} as SettingsContext,
    events: {} as SettingsEvent,
  },
  actions: {
    subscribe: assign(({ self }) => {
      const id = `settings-${self.id}-${++subscriptionCounter}`
      subscribeById(id, { send: (event) => self.send(event as SettingsEvent) })
      return { subscriptionId: id }
    }),
    unsubscribe: ({ context }) => {
      if (context.subscriptionId) {
        unsubscribeById(context.subscriptionId)
      }
    },
    fetchSettings: () => {
      emitToSocket("GET_ROOM_SETTINGS", {})
    },
    setPluginConfigs: assign(({ context, event }) => {
      if (event.type === "INIT" && event.data.pluginConfigs) {
        // INIT is public-only room hydration — merge over existing per-plugin
        // config so a reconnect doesn't wipe admin-fetched private fields (ADR 0068).
        const merged: Record<string, Record<string, unknown>> = { ...context.pluginConfigs }
        for (const [name, publicConfig] of Object.entries(event.data.pluginConfigs)) {
          merged[name] = { ...(context.pluginConfigs[name] ?? {}), ...publicConfig }
        }
        return { pluginConfigs: merged }
      }
      return context
    }),
    setValues: assign(({ context, event }) => {
      if (event.type === "ROOM_SETTINGS" || event.type === "ROOM_SETTINGS_UPDATED") {
        // Plugin config secrecy (ADR 0068): `ROOM_SETTINGS` is the admin-gated,
        // per-socket MERGED pull (public + private), so it is authoritative and
        // replaces stored configs. `ROOM_SETTINGS_UPDATED` is a room-wide PUBLIC
        // broadcast — merge its public fields over the existing per-plugin config
        // so admin-fetched private fields (e.g. quiz questions/accepted answers)
        // are preserved rather than wiped by the public-only payload.
        let pluginConfigs = context.pluginConfigs
        if (event.data.pluginConfigs) {
          if (event.type === "ROOM_SETTINGS") {
            pluginConfigs = event.data.pluginConfigs
          } else {
            const merged: Record<string, Record<string, unknown>> = { ...context.pluginConfigs }
            for (const [name, publicConfig] of Object.entries(event.data.pluginConfigs)) {
              merged[name] = { ...(context.pluginConfigs[name] ?? {}), ...publicConfig }
            }
            pluginConfigs = merged
          }
        }

        const newContext = {
          title: event.data.room.title,
          fetchMeta: event.data.room.fetchMeta,
          extraInfo: event.data.room.extraInfo,
          password: event.data.room.password,
          artwork: event.data.room.artwork,
          artworkStreamingOnly: event.data.room.artworkStreamingOnly,
          deputizeOnJoin: event.data.room.deputizeOnJoin,
          enableSpotifyLogin: event.data.room.enableSpotifyLogin,
          type: event.data.room.type,
          radioMetaUrl: event.data.room.radioMetaUrl,
          radioListenUrl: event.data.room.radioListenUrl,
          radioProtocol: event.data.room.radioProtocol,
          liveIngestEnabled: event.data.room.liveIngestEnabled ?? false,
          liveWhepUrl: event.data.room.liveWhepUrl ?? "",
          liveHlsUrl: event.data.room.liveHlsUrl ?? "",
          announceNowPlaying: event.data.room.announceNowPlaying,
          announceUsernameChanges: event.data.room.announceUsernameChanges,
          allowChatImages: event.data.room.allowChatImages,
          showId: event.data.room.showId,
          activeSegmentId: event.data.room.activeSegmentId,
          activeShowSegmentId: event.data.room.activeShowSegmentId,
          showSchedulePublic: event.data.room.showSchedulePublic,
          announceActiveSegment: event.data.room.announceActiveSegment,
          public: event.data.room.public,
          playbackControllerId: event.data.room.playbackControllerId,
          pluginConfigs,
        }
        return newContext
      }
      return context
    }),
    resetSettings: assign(() => defaultContext),
  },
}).createMachine({
  id: "settings",
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
          actions: ["resetSettings"],
        },
        INIT: {
          actions: "setPluginConfigs",
        },
        ROOM_SETTINGS: {
          actions: "setValues",
          target: ".fetched",
        },
        ROOM_SETTINGS_UPDATED: {
          actions: "setValues",
        },
        FETCH: ".pending",
      },
      initial: "pending",
      states: {
        pending: {
          entry: ["fetchSettings"],
        },
        failed: {},
        fetched: {
          initial: "untouched",
          states: {
            untouched: {
              on: {
                SUBMIT: { target: "pending" },
              },
            },
            pending: {},
            successful: {
              after: {
                2000: "untouched",
              },
            },
            failed: {},
          },
        },
      },
    },
  },
})
