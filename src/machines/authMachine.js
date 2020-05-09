import { Machine, assign } from "xstate"

export const authMachine = Machine(
  {
    id: "auth",
    initial: "unauthenticated",
    context: {
      currentUser: {},
    },
    states: {
      unauthenticated: {
        on: {
          SETUP: { target: "initiated" },
        },
      },
      initiated: {
        entry: ["getCurrentUser"],
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
        entry: ["login"],
        on: {
          LOGIN: {
            target: "authenticated",
          },
        },
      },
      authenticated: {
        on: {
          USER_DISCONNECTED: {
            target: "unauthenticated",
            actions: "disconnectUser",
          },
          UPDATE_USERNAME: {
            target: "editingUsername",
            actions: ["getCurrentUser"],
          },
        },
      },
    },
  },
  {
    actions: {
      setCurrentUser: assign((ctx, event) => {
        return { currentUser: event.data.currentUser }
      }),
    },
  }
)
