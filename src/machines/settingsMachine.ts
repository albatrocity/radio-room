import { createMachine, assign, sendTo } from "xstate"
import socketService from "../lib/socketService"

interface Context {
  fetchMeta: boolean
  extraInfo: string
  password: string
  artwork?: string
  deputizeOnJoin: boolean
  enableSpotifyLogin: boolean
}

type Event =
  | { type: "FETCH" }
  | { type: "SETTINGS"; data: Context }
  | { type: "SUBMIT"; target: "pending" }

export const settingsMachine = createMachine<Context, Event>(
  {
    predictableActionArguments: true,
    id: "settings",
    initial: "pending",
    context: {
      fetchMeta: true,
      extraInfo: "",
      password: "",
      artwork: undefined,
      deputizeOnJoin: false,
      enableSpotifyLogin: false,
    },
    invoke: [
      {
        id: "socket",
        src: () => socketService,
      },
    ],
    on: {
      SETTINGS: {
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
        if (event.type === "SETTINGS") {
          return {
            fetchMeta: event.data.fetchMeta,
            extraInfo: event.data.extraInfo,
            password: event.data.password,
            artwork: event.data.artwork,
            deputizeOnJoin: event.data.deputizeOnJoin,
            enableSpotifyLogin: event.data.enableSpotifyLogin,
          }
        }
        return ctx
      }),
    },
  },
)
