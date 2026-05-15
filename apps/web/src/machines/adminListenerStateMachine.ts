/**
 * Admin listener game state machine
 *
 * When the room admin opens the "All listeners" tab in the game state modal,
 * subscribes to socket events and keeps a snapshot of every session
 * participant's attributes and inventory in sync.
 *
 * Send ACTIVATE when the tab is shown, DEACTIVATE when hidden or the modal closes.
 */

import type { GameSession, ItemDefinition, UserGameState, UserInventory } from "@repo/types"
import { setup, assign } from "xstate"
import { emitToSocket, subscribeById, unsubscribeById } from "../actors/socketActor"

export interface AdminListenerRow {
  userId: string
  username: string
  state: UserGameState
  inventory: UserInventory
}

export interface AllListenerGameStatesPayload {
  session: GameSession | null
  listeners: AdminListenerRow[]
  itemDefinitions: ItemDefinition[]
}

export interface AdminListenerStateContext {
  subscriptionId: string | null
  payload: AllListenerGameStatesPayload | null
  error: string | null
}

type AdminListenerEvent =
  | { type: "ACTIVATE" }
  | { type: "DEACTIVATE" }
  | { type: "REFRESH" }
  | { type: "ALL_LISTENER_GAME_STATES"; data: AllListenerGameStatesPayload }
  | { type: "GAME_STATE_CHANGED"; data?: unknown }
  | { type: "INVENTORY_ITEM_ACQUIRED"; data?: { userId?: string } }
  | { type: "INVENTORY_ITEM_REMOVED"; data?: { userId?: string } }
  | { type: "INVENTORY_ITEM_USED"; data?: { userId?: string } }
  | { type: "INVENTORY_ITEM_TRANSFERRED"; data?: { userId?: string } }
  | { type: "USER_JOINED"; data?: unknown }
  | { type: "USER_LEFT"; data?: unknown }
  | { type: "GAME_SESSION_STARTED"; data?: unknown }
  | { type: "GAME_SESSION_ENDED"; data?: unknown }
  | { type: "ERROR_OCCURRED"; data?: { message?: string } }

let subscriptionCounter = 0

export const adminListenerStateMachine = setup({
  types: {
    context: {} as AdminListenerStateContext,
    events: {} as AdminListenerEvent,
  },
  actions: {
    subscribe: assign(({ self }) => {
      const id = `adminListener-${self.id}-${++subscriptionCounter}`
      subscribeById(id, { send: (event) => self.send(event as AdminListenerEvent) })
      return { subscriptionId: id }
    }),
    unsubscribe: ({ context }) => {
      if (context.subscriptionId) {
        unsubscribeById(context.subscriptionId)
      }
    },
    clearSubscriptionId: assign({
      subscriptionId: () => null,
    }),
    requestData: () => {
      emitToSocket("GET_ALL_LISTENER_GAME_STATES", {})
    },
    setPayload: assign(({ event }) => {
      if (event.type !== "ALL_LISTENER_GAME_STATES") return {}
      const d = event.data
      return {
        payload: {
          session: d.session,
          listeners: d.listeners ?? [],
          itemDefinitions: d.itemDefinitions ?? [],
        },
        error: null,
      }
    }),
    reset: assign({
      subscriptionId: () => null,
      payload: () => null,
      error: () => null,
    }),
    setError: assign(({ event }) => {
      if (event.type !== "ERROR_OCCURRED") return {}
      return { error: event.data?.message ?? "Could not load listener stats." }
    }),
  },
}).createMachine({
  id: "adminListenerState",
  initial: "idle",
  context: {
    subscriptionId: null,
    payload: null,
    error: null,
  },
  states: {
    idle: {
      on: {
        ACTIVATE: "loading",
      },
    },
    loading: {
      entry: ["subscribe", "requestData"],
      on: {
        DEACTIVATE: {
          target: "idle",
          actions: ["unsubscribe", "reset"],
        },
        ALL_LISTENER_GAME_STATES: {
          target: "ready",
          actions: ["setPayload"],
        },
        ERROR_OCCURRED: {
          target: "error",
          actions: ["setError"],
        },
      },
    },
    ready: {
      on: {
        DEACTIVATE: {
          target: "idle",
          actions: ["unsubscribe", "reset"],
        },
        REFRESH: "refreshing",
        ALL_LISTENER_GAME_STATES: {
          actions: ["setPayload"],
        },
        GAME_STATE_CHANGED: {
          actions: ["requestData"],
        },
        INVENTORY_ITEM_ACQUIRED: {
          actions: ["requestData"],
        },
        INVENTORY_ITEM_REMOVED: {
          actions: ["requestData"],
        },
        INVENTORY_ITEM_USED: {
          actions: ["requestData"],
        },
        INVENTORY_ITEM_TRANSFERRED: {
          actions: ["requestData"],
        },
        USER_JOINED: {
          actions: ["requestData"],
        },
        USER_LEFT: {
          actions: ["requestData"],
        },
        GAME_SESSION_STARTED: {
          actions: ["requestData"],
        },
        GAME_SESSION_ENDED: {
          actions: ["requestData"],
        },
      },
    },
    refreshing: {
      entry: ["requestData"],
      on: {
        DEACTIVATE: {
          target: "idle",
          actions: ["unsubscribe", "reset"],
        },
        ALL_LISTENER_GAME_STATES: {
          target: "ready",
          actions: ["setPayload"],
        },
        ERROR_OCCURRED: {
          target: "error",
          actions: ["setError"],
        },
      },
    },
    error: {
      entry: ["unsubscribe", "clearSubscriptionId"],
      on: {
        DEACTIVATE: {
          target: "idle",
          actions: ["unsubscribe", "reset"],
        },
        REFRESH: "loading",
      },
    },
  },
})
