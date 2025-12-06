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
  | "deputizeOnJoin"
  | "enableSpotifyLogin"
  | "type"
  | "radioMetaUrl"
  | "radioListenUrl"
  | "radioProtocol"
  | "announceUsernameChanges"
  | "announceNowPlaying"
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
  title: "",
  fetchMeta: true,
  extraInfo: "",
  password: "",
  artwork: undefined,
  deputizeOnJoin: false,
  enableSpotifyLogin: false,
  type: "jukebox",
  radioMetaUrl: "",
  radioListenUrl: "",
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
        return { pluginConfigs: event.data.pluginConfigs }
      }
      return context
    }),
    setValues: assign(({ context, event }) => {
      if (event.type === "ROOM_SETTINGS" || event.type === "ROOM_SETTINGS_UPDATED") {
        // Get plugin configs from the event, preserving existing if not provided
        const pluginConfigs = event.data.pluginConfigs ?? context.pluginConfigs

        const newContext = {
          title: event.data.room.title,
          fetchMeta: event.data.room.fetchMeta,
          extraInfo: event.data.room.extraInfo,
          password: event.data.room.password,
          artwork: event.data.room.artwork,
          deputizeOnJoin: event.data.room.deputizeOnJoin,
          enableSpotifyLogin: event.data.room.enableSpotifyLogin,
          type: event.data.room.type,
          radioMetaUrl: event.data.room.radioMetaUrl,
          radioListenUrl: event.data.room.radioListenUrl,
          radioProtocol: event.data.room.radioProtocol,
          announceNowPlaying: event.data.room.announceNowPlaying,
          announceUsernameChanges: event.data.room.announceUsernameChanges,
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
