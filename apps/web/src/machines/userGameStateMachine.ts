/**
 * User Game State Machine
 *
 * Manages the current user's game state (session, attributes, inventory).
 * Subscribes to socket events and re-fetches on relevant changes.
 *
 * Send ACTIVATE on room entry, DEACTIVATE on room exit (see roomLifecycle).
 * Send REFRESH when the modal opens to ensure fresh data.
 * Handles socket `INIT` (post-LOGIN) by requesting game state again — the initial
 * `GET_MY_GAME_STATE` from ACTIVATE can run before LOGIN attaches `roomId`.
 */

import type { GameSession, ItemDefinition, UserGameState, UserInventory } from "@repo/types"
import { setup, assign } from "xstate"
import { emitToSocket, subscribeById, unsubscribeById } from "../actors/socketActor"

export interface UserGameStatePayload {
  session: GameSession | null
  state: UserGameState | null
  inventory: UserInventory | null
  itemDefinitions: ItemDefinition[]
}

interface UserGameStateContext {
  subscriptionId: string | null
  payload: UserGameStatePayload | null
  error: string | null
}

type UserGameStateEvent =
  | { type: "ACTIVATE" }
  | { type: "DEACTIVATE" }
  | { type: "REFRESH" }
  /** After LOGIN the socket has `roomId`; re-fetch so GET_MY_GAME_STATE is not lost to the pre-login timing race. */
  | { type: "INIT"; data?: unknown }
  | { type: "USER_GAME_STATE"; data: UserGameStatePayload }
  | { type: "GAME_STATE_CHANGED"; data: { userId?: string } }
  | { type: "GAME_MODIFIER_APPLIED"; data: { userId?: string } }
  | { type: "GAME_MODIFIER_REMOVED"; data: { userId?: string } }
  | { type: "INVENTORY_ITEM_ACQUIRED"; data: { userId?: string } }
  | { type: "INVENTORY_ITEM_REMOVED"; data: { userId?: string } }
  | { type: "INVENTORY_ITEM_USED"; data: { userId?: string } }
  | { type: "INVENTORY_ITEM_TRANSFERRED"; data: { userId?: string } }
  | { type: "GAME_SESSION_STARTED"; data: unknown }
  | { type: "GAME_SESSION_ENDED"; data: unknown }
  | { type: "ERROR_OCCURRED"; data: { message?: string } }

const EVENTS_THAT_TRIGGER_REFRESH = new Set([
  "GAME_STATE_CHANGED",
  "GAME_MODIFIER_APPLIED",
  "GAME_MODIFIER_REMOVED",
  "INVENTORY_ITEM_ACQUIRED",
  "INVENTORY_ITEM_REMOVED",
  "INVENTORY_ITEM_USED",
  "INVENTORY_ITEM_TRANSFERRED",
])

let subscriptionCounter = 0

export const userGameStateMachine = setup({
  types: {
    context: {} as UserGameStateContext,
    events: {} as UserGameStateEvent,
  },
  guards: {
    isRelevantUserEvent: ({ event }, { currentUserId }: { currentUserId: string | undefined }) => {
      if (!EVENTS_THAT_TRIGGER_REFRESH.has(event.type)) return false
      const data = (event as { data?: { userId?: string } }).data
      return !currentUserId || !data?.userId || data.userId === currentUserId
    },
  },
  actions: {
    subscribe: assign(({ self }) => {
      const id = `userGameState-${self.id}-${++subscriptionCounter}`
      subscribeById(id, { send: (event) => self.send(event as UserGameStateEvent) })
      return { subscriptionId: id }
    }),
    unsubscribe: ({ context }) => {
      if (context.subscriptionId) {
        unsubscribeById(context.subscriptionId)
      }
    },
    requestGameState: () => {
      emitToSocket("GET_MY_GAME_STATE", {})
    },
    setPayload: assign(({ event }) => {
      if (event.type !== "USER_GAME_STATE") return {}
      return { payload: event.data, error: null }
    }),
    clearPayload: assign({
      payload: () => ({
        session: null,
        state: null,
        inventory: null,
        itemDefinitions: [],
      }),
      error: () => null,
    }),
    setError: assign(({ event }) => {
      if (event.type !== "ERROR_OCCURRED") return {}
      return { error: event.data?.message ?? "Could not load your game state." }
    }),
    reset: assign({
      subscriptionId: () => null,
      payload: () => null,
      error: () => null,
    }),
  },
}).createMachine({
  id: "userGameState",
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
      entry: ["subscribe", "requestGameState"],
      on: {
        DEACTIVATE: {
          target: "idle",
          actions: ["unsubscribe", "reset"],
        },
        INIT: {
          actions: ["requestGameState"],
        },
        USER_GAME_STATE: {
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
        REFRESH: {
          target: "refreshing",
        },
        INIT: {
          actions: ["requestGameState"],
        },
        USER_GAME_STATE: {
          actions: ["setPayload"],
        },
        GAME_SESSION_STARTED: {
          actions: ["requestGameState"],
        },
        GAME_SESSION_ENDED: {
          actions: ["clearPayload"],
        },
        GAME_STATE_CHANGED: {
          actions: ["requestGameState"],
        },
        GAME_MODIFIER_APPLIED: {
          actions: ["requestGameState"],
        },
        GAME_MODIFIER_REMOVED: {
          actions: ["requestGameState"],
        },
        INVENTORY_ITEM_ACQUIRED: {
          actions: ["requestGameState"],
        },
        INVENTORY_ITEM_REMOVED: {
          actions: ["requestGameState"],
        },
        INVENTORY_ITEM_USED: {
          actions: ["requestGameState"],
        },
        INVENTORY_ITEM_TRANSFERRED: {
          actions: ["requestGameState"],
        },
      },
    },
    refreshing: {
      entry: ["requestGameState"],
      on: {
        DEACTIVATE: {
          target: "idle",
          actions: ["unsubscribe", "reset"],
        },
        INIT: {
          actions: ["requestGameState"],
        },
        USER_GAME_STATE: {
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
      on: {
        DEACTIVATE: {
          target: "idle",
          actions: ["unsubscribe", "reset"],
        },
        INIT: {
          target: "refreshing",
        },
        REFRESH: {
          target: "loading",
        },
      },
    },
  },
})
