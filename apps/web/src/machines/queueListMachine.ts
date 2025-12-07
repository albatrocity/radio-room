import { assign, setup } from "xstate"
import { QueueItem } from "../types/Queue"
import { subscribeById, unsubscribeById } from "../actors/socketActor"

// ============================================================================
// Types
// ============================================================================

export interface QueueListContext {
  queue: QueueItem[]
  subscriptionId: string | null
}

type QueueListEvent =
  | { type: "ACTIVATE" }
  | { type: "DEACTIVATE" }
  | { type: "INIT"; data: { queue?: QueueItem[] } }
  | { type: "QUEUE_CHANGED"; data: { queue: QueueItem[] } }

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
    setQueue: assign({
      queue: ({ event }) => {
        if (event.type === "INIT") {
          return event.data.queue || []
        }
        if (event.type === "QUEUE_CHANGED") {
          return event.data.queue || []
        }
        return []
      },
    }),
    resetQueue: assign({
      queue: () => [],
      subscriptionId: () => null,
    }),
  },
}).createMachine({
  id: "queueList",
  initial: "idle",
  context: {
    queue: [],
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
          actions: ["resetQueue"],
        },
        INIT: {
          actions: ["setQueue"],
        },
        QUEUE_CHANGED: {
          actions: ["setQueue"],
        },
      },
    },
  },
})
