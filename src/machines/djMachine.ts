import { sendTo, createMachine } from "xstate"
import socketService from "../lib/socketService"
import { useAuthStore } from "../state/authStore"

export const djMachine = createMachine(
  {
    predictableActionArguments: true,
    id: "dj",
    initial: "inactive",
    invoke: [
      {
        id: "socket",
        src: () => socketService,
      },
    ],
    states: {
      djaying: {
        on: {
          END_DJ_SESSION: {
            target: "inactive",
            actions: ["endDjSession"],
            cond: "isAdmin",
          },
        },
      },
      deputyDjaying: {
        on: {
          END_DEPUTY_DJ_SESSION: "inactive",
        },
      },
      inactive: {
        on: {
          START_DJ_SESSION: {
            target: "djaying",
            actions: ["startDjSession"],
            cond: "isAdmin",
          },
          START_DEPUTY_DJ_SESSION: "deputyDjaying",
        },
      },
    },
  },
  {
    guards: {
      isAdmin: () => {
        return useAuthStore.getState().state.context.isAdmin
      },
    },
    actions: {
      startDjSession: sendTo("socket", () => {
        return {
          type: "set DJ",
          data: useAuthStore.getState().state.context.currentUser?.userId,
        }
      }),
      endDjSession: sendTo("socket", () => {
        return { type: "set DJ", data: null }
      }),
    },
  },
)
