import { Machine, assign } from "xstate"
import { isNil } from "lodash/fp"

export const authMachine = Machine(
  {
    id: "auth",
    initial: "unauthenticated",
    context: {
      currentUser: {},
      isNewUser: false,
      isAdmin: false,
      shouldRetry: true,
    },
    states: {
      unauthenticated: {
        on: {
          SETUP: { target: "initiated" },
        },
      },
      disconnected: {
        entry: [() => console.log("disconnected entry")],
        on: {
          "": {
            target: "initiated",
            cond: "shouldRetry",
          },
        },
      },
      initiated: {
        entry: ["getCurrentUser", () => console.log("initiated entry")],
        on: {
          CREDENTIALS: {
            target: "connecting",
            actions: ["setupListeners", "setCurrentUser"],
          },
        },
      },
      editingUsername: {
        on: {
          CREDENTIALS: {
            target: "connecting",
            actions: ["setCurrentUser", "changeUsername"],
          },
        },
      },
      connecting: {
        entry: [
          "login",
          () => console.log("connecting entry action after login."),
        ],
        on: {
          LOGIN: {
            target: "authenticated",
          },
        },
        after: {
          3000: "connecting",
        },
      },
      authenticated: {
        on: {
          USER_DISCONNECTED: {
            target: "disconnected",
            actions: ["setRetry", "disconnectUser"],
          },
          UPDATE_USERNAME: {
            target: "editingUsername",
            actions: ["unsetNew", "getCurrentUser"],
          },
          ACTIVATE_ADMIN: {
            actions: ["activateAdmin"],
          },
        },
      },
    },
  },
  {
    actions: {
      setCurrentUser: assign((ctx, event) => {
        return {
          currentUser: event.data.currentUser,
          isNewUser: event.data.isNewUser,
        }
      }),
      unsetNew: assign((ctx, event) => {
        return {
          isNewUser: false,
        }
      }),
      activateAdmin: assign((ctx, event) => {
        return {
          isAdmin: true,
          currentUser: { ...ctx.currentUser, isAdmin: true },
        }
      }),
      setRetry: assign({
        shouldRetry: (context, event) => {
          return isNil(event.shouldRetry) ? true : event.shouldRetry
        },
      }),
    },
    guards: {
      shouldRetry: ctx => ctx.shouldRetry,
    },
  }
)
