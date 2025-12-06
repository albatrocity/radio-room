import { setup, assign } from "xstate"
import { InitPayload } from "../types/InitPayload"
import { getIsAdmin, getCurrentUser } from "../actors/authActor"
import { emitToSocket, subscribeById, unsubscribeById } from "../actors/socketActor"

// ============================================================================
// Types
// ============================================================================

interface DjContext {
  subscriptionId: string | null
}

type DjEvent =
  | { type: "ACTIVATE" }
  | { type: "DEACTIVATE" }
  | { type: "INIT"; data: InitPayload }
  | { type: "END_DJ_SESSION" }
  | { type: "START_DJ_SESSION" }
  | { type: "START_DEPUTY_DJ_SESSION" }
  | { type: "END_DEPUTY_DJ_SESSION" }

// ============================================================================
// Machine
// ============================================================================

let subscriptionCounter = 0

export const djMachine = setup({
  types: {
    context: {} as DjContext,
    events: {} as DjEvent,
  },
  guards: {
    isAdmin: () => {
      return getIsAdmin()
    },
    isDeputyDj: ({ event }) => {
      if (event.type !== "INIT") return false
      return !!event.data.user?.isDeputyDj
    },
  },
  actions: {
    subscribe: assign(({ self }) => {
      const id = `dj-${self.id}-${++subscriptionCounter}`
      subscribeById(id, { send: (event) => self.send(event) })
      return { subscriptionId: id }
    }),
    unsubscribe: ({ context }) => {
      if (context.subscriptionId) {
        unsubscribeById(context.subscriptionId)
      }
    },
    startDjSession: () => {
      const currentUser = getCurrentUser()
      emitToSocket("SET_DJ", currentUser?.userId)
    },
    endDjSession: () => {
      emitToSocket("SET_DJ", null)
    },
    reset: assign({
      subscriptionId: () => null,
    }),
  },
}).createMachine({
  id: "dj",
  initial: "idle",
  context: {
    subscriptionId: null,
  },
  states: {
    // Idle state - not subscribed to socket events
    idle: {
      on: {
        ACTIVATE: "active",
      },
    },
    // Active state - subscribed to socket events
    active: {
      entry: ["subscribe"],
      exit: ["unsubscribe"],
      on: {
        DEACTIVATE: {
          target: "idle",
          actions: ["reset"],
        },
        INIT: {
          target: ".deputyDjaying",
          guard: "isDeputyDj",
        },
      },
      initial: "inactive",
      states: {
        djaying: {
          on: {
            END_DJ_SESSION: {
              target: "inactive",
              actions: ["endDjSession"],
              guard: "isAdmin",
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
              guard: "isAdmin",
            },
            START_DEPUTY_DJ_SESSION: "deputyDjaying",
          },
        },
      },
    },
  },
})
