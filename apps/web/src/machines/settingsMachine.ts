import { createMachine, assign } from "xstate"
import { Room } from "../types/Room"
import { emitToSocket } from "../actors/socketActor"

type Context = Pick<
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
}

type Event =
  | { type: "FETCH" }
  | {
      type: "ROOM_SETTINGS"
      data: { room: Room; pluginConfigs?: Record<string, Record<string, unknown>> }
    }
  | {
      type: "ROOM_SETTINGS_UPDATED"
      data: { roomId: string; room: Room; pluginConfigs?: Record<string, Record<string, unknown>> }
    }
  | { type: "SUBMIT"; target: "pending" }

export const settingsMachine = createMachine<Context, Event>(
  {
    predictableActionArguments: true,
    id: "settings",
    initial: "pending",
    context: {
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
    },
    on: {
      ROOM_SETTINGS: {
        actions: "setValues",
        target: "fetched",
      },
      ROOM_SETTINGS_UPDATED: {
        actions: "setValues",
      },
      FETCH: "pending",
    },
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
  {
    actions: {
      fetchSettings: () => {
        emitToSocket("GET_ROOM_SETTINGS", {})
      },
      setValues: assign((ctx, event) => {
        if (event.type === "ROOM_SETTINGS" || event.type === "ROOM_SETTINGS_UPDATED") {
          // Get plugin configs from the event, preserving existing if not provided
          const pluginConfigs = event.data.pluginConfigs ?? ctx.pluginConfigs

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
        return ctx
      }),
    },
  },
)
