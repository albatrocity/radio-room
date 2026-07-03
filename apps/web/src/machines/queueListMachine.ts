import { assign, setup } from "xstate"
import { QueueItem } from "../types/Queue"
import { subscribeById, unsubscribeById } from "../actors/socketActor"

// ============================================================================
// Types
// ============================================================================

export interface QueueListContext {
  queue: QueueItem[]
  splitKey: string | null
  subscriptionId: string | null
}

type QueueListEvent =
  | { type: "ACTIVATE" }
  | { type: "DEACTIVATE" }
  | {
      type: "INIT"
      data: { queue?: QueueItem[]; splitKey?: string | null }
    }
  | { type: "QUEUE_CHANGED"; data: { queue: QueueItem[]; splitKey?: string | null } }

// ============================================================================
// Machine
// ============================================================================

let subscriptionCounter = 0

export const queueListMachine = setup({
  types: {
    context: {} as QueueListContext,
    events: {} as QueueListEvent,
  },
  actions: {
    subscribe: assign(({ context, self }) => {
      const id = `queueList-${self.id}-${++subscriptionCounter}`
      subscribeById(id, { send: (event) => self.send(event as QueueListEvent) })
      return { subscriptionId: id }
    }),
    unsubscribe: ({ context }) => {
      if (context.subscriptionId) {
        unsubscribeById(context.subscriptionId)
      }
    },
    applySocketQueue: assign(({ event }) => {
      if (event.type === "INIT" || event.type === "QUEUE_CHANGED") {
        return {
          queue: event.data.queue ?? [],
          splitKey: event.data.splitKey ?? null,
        }
      }
      return {}
    }),
    resetQueue: assign({
      queue: () => [],
      splitKey: () => null,
      subscriptionId: () => null,
    }),
  },
}).createMachine({
  id: "queueList",
  initial: "idle",
  context: {
    queue: [],
    splitKey: null,
    subscriptionId: null,
  },
  states: {
    idle: {
      on: {
        ACTIVATE: "active",
      },
    },
    active: {
      entry: ["subscribe"],
      exit: ["unsubscribe"],
      on: {
        DEACTIVATE: {
          target: "idle",
          actions: ["resetQueue"],
        },
        INIT: {
          actions: ["applySocketQueue"],
        },
        QUEUE_CHANGED: {
          actions: ["applySocketQueue"],
        },
      },
    },
  },
})
