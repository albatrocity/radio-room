import { createMachine, assign, sendTo } from "xstate"
import socketService from "../lib/socketService"
import { Room } from "../types/Room"
import type { PlaylistDemocracyConfig } from "@repo/plugin-playlist-democracy"

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
  playlistDemocracy: PlaylistDemocracyConfig
}

type Event =
  | { type: "FETCH" }
  | { type: "ROOM_SETTINGS"; data: { room: Room; playlistDemocracy?: PlaylistDemocracyConfig } }
  | { type: "ROOM_SETTINGS_UPDATED"; data: { roomId: string; room: Room; playlistDemocracy?: PlaylistDemocracyConfig } }
  | { type: "SUBMIT"; target: "pending" }

export const defaultConfig: PlaylistDemocracyConfig = {
  enabled: false,
  reactionType: "+1",
  timeLimit: 60000,
  thresholdType: "percentage",
  thresholdValue: 50,
}

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
      playlistDemocracy: defaultConfig,
    },
    invoke: [
      {
        id: "socket",
        src: () => socketService as any,
      },
    ],
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
      fetchSettings: sendTo("socket", () => ({ type: "GET_ROOM_SETTINGS" })),
      setValues: assign((ctx, event) => {
        if (event.type === "ROOM_SETTINGS" || event.type === "ROOM_SETTINGS_UPDATED") {
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
            playlistDemocracy: event.data.playlistDemocracy || defaultConfig,
          }
          return newContext
        }
        return ctx
      }),
    },
  },
)
