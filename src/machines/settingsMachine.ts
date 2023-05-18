import { createMachine, assign, sendTo } from "xstate"
import socketService from "../lib/socketService"

interface Context {
  fetchMeta: boolean
  extraInfo: string
  password: string
  artwork?: string
}

export const settingsMachine = createMachine<Context>(
  {
    predictableActionArguments: true,
    id: "settings",
    initial: "pending",
    context: {
      fetchMeta: true,
      extraInfo: "",
      password: "",
      artwork: undefined,
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
      fetchSettings: sendTo("socket", () => ({ type: "get settings" })),
      setValues: assign((_context, event) => {
        if (event.type === "SETTINGS") {
          return {
            fetchMeta: event.data.fetchMeta,
            extraInfo: event.data.extraInfo,
            password: event.data.password,
            artwork: event.data.artwork,
          }
        }
      }),
    },
  },
)
