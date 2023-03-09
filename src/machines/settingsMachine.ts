import { createMachine, assign } from "xstate"

interface Context {
  fetchMeta: boolean
  extraInfo: string
  donationURL: string
  password: string
}

export const settingsMachine = createMachine<Context>(
  {
    id: "settings",
    initial: "pending",
    context: {
      fetchMeta: true,
      extraInfo: "",
      donationURL: "",
      password: "",
    },
    states: {
      pending: {
        invoke: {
          src: "fetchSettings",
          onDone: { target: "fetched", actions: ["setValues"] },
          onError: { target: "failed" },
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
      setValues: assign((_context, event) => {
        return {
          fetchMeta: event.data.fetchMeta,
          extraInfo: event.data.extraInfo,
          donationURL: event.data.donationURL,
          password: event.data.password,
        }
      }),
    },
  },
)
