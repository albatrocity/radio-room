import { createMachine, assign, sendTo } from "xstate"
import socketService from "../lib/socketService"

interface Context {
  fetchMeta: boolean
  extraInfo: string
  donationURL: string
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
      donationURL: "",
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
        invoke: {
          src: "watchForUpdate",
          onDone: { target: "fetched.successful" },
          onError: { target: "fetched.failed" },
        },
        after: {
          5000: "failed",
        },
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
          pending: {
            invoke: {
              src: "watchForUpdate",
              onDone: "successful",
              onError: { target: "#settings.failed" },
            },
          },
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
        console.log("set values!", event.data)
        if (event.type === "SETTINGS") {
          return {
            fetchMeta: event.data.fetchMeta,
            extraInfo: event.data.extraInfo,
            donationURL: event.data.donationURL,
            password: event.data.password,
            artwork: event.data.artwork,
          }
        }
      }),
    },
  },
)
