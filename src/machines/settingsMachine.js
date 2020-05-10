import { Machine, assign } from "xstate"

export const settingsMachine = Machine(
  {
    id: "settings",
    initial: "pending",
    context: {
      fetchMeta: true,
      extraInfo: "",
      donationURL: "",
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
      setValues: assign((context, event) => {
        return {
          fetchMeta: event.data.fetchMeta,
          extraInfo: event.data.extraInfo,
          donationURL: event.data.donationURL,
        }
      }),
    },
  }
)
