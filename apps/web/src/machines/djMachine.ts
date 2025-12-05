import { createMachine } from "xstate"
import { InitPayload } from "../types/InitPayload"
import { getIsAdmin, getCurrentUser } from "../actors/authActor"
import { emitToSocket } from "../actors/socketActor"

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
        return getIsAdmin()
      },
      isDeputyDj: (_ctx, event) => {
        if (event.type !== "INIT") return false
        return !!event.data.user?.isDeputyDj
      },
    },
    actions: {
      startDjSession: () => {
        const currentUser = getCurrentUser()
        emitToSocket("SET_DJ", currentUser?.userId)
      },
      endDjSession: () => {
        emitToSocket("SET_DJ", null)
      },
    },
  },
)
