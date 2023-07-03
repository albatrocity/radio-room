import { sendTo, createMachine } from "xstate"
import socketService from "../lib/socketService"
import { useAuthStore } from "../state/authStore"
import { InitPayload } from "../types/InitPayload"

interface Context {}

type Event =
  | { type: "INIT"; data: InitPayload }
  | { type: "END_DJ_SESSION" }
  | { type: "START_DJ_SESSION" }
  | { type: "START_DEPUTY_DJ_SESSION" }
  | { type: "END_DEPUTY_DJ_SESSION" }

export const djMachine = createMachine<Context, Event>(
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
    on: {
      INIT: {
        target: "deputyDjaying",
        cond: "isDeputyDj",
      },
    },
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
      isDeputyDj: (_ctx, event) => {
        if (event.type !== "INIT") return false
        return !!event.data.currentUser?.isDeputyDj
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
