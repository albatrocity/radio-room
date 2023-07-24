import { createMachine, assign, sendTo } from "xstate"
import socketService from "../lib/socketService"
import { Room } from "../types/Room"

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
  | "radioUrl"
  | "radioProtocol"
>

type Event =
  | { type: "FETCH" }
  | { type: "ROOM_SETTINGS"; data: { room: Room } }
  | { type: "SUBMIT"; target: "pending" }

export const settingsMachine = createMachine<Context, Event>(
  {
    predictableActionArguments: true,
    id: "settings",
    initial: "pending",
    context: {
      title: "",
      fetchMeta: true,
      extraInfo: "",
      password: "",
      artwork: undefined,
      deputizeOnJoin: false,
      enableSpotifyLogin: false,
      type: "jukebox",
      radioUrl: "",
    },
    invoke: [
      {
        id: "socket",
        src: () => socketService,
      },
    ],
    on: {
      ROOM_SETTINGS: {
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
      fetchSettings: sendTo("socket", () => ({ type: "get room settings" })),
      setValues: assign((ctx, event) => {
        if (event.type === "ROOM_SETTINGS") {
          return {
            title: event.data.room.title,
            fetchMeta: event.data.room.fetchMeta,
            extraInfo: event.data.room.extraInfo,
            password: event.data.room.password,
            artwork: event.data.room.artwork,
            deputizeOnJoin: event.data.room.deputizeOnJoin,
            enableSpotifyLogin: event.data.room.enableSpotifyLogin,
            type: event.data.room.type,
            radioUrl: event.data.room.radioUrl,
            radioProtocol: event.data.room.radioProtocol,
          }
        }
        return ctx
      }),
    },
  },
)
