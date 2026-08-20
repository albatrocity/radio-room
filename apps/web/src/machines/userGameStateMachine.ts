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
 *
 * Plugins that implement `contributeToUserGameState` trigger refetch via the
 * room-wide `USER_GAME_STATE_INVALIDATED` event (ADR 0097).
 */

import type { UserGameStatePayload } from "@repo/types"
import { setup, assign } from "xstate"
import { emitToSocket, subscribeById, unsubscribeById } from "../actors/socketActor"
import { getCurrentUser } from "../actors/authActor"
import { isGameEventForUser, type UserScopedEventData } from "../lib/gameEventRelevance"
import { createTrailingDebounce } from "../lib/trailingDebounce"

export type { UserGameStatePayload }

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
  | { type: "USER_GAME_STATE_INVALIDATED"; data?: { roomId?: string; pluginName?: string } }
  | { type: "GAME_STATE_CHANGED"; data: UserScopedEventData }
  | { type: "GAME_MODIFIER_APPLIED"; data: UserScopedEventData }
  | { type: "GAME_MODIFIER_REMOVED"; data: UserScopedEventData }
  | { type: "INVENTORY_ITEM_ACQUIRED"; data: UserScopedEventData }
  | { type: "INVENTORY_ITEM_REMOVED"; data: UserScopedEventData }
  | { type: "INVENTORY_ITEM_USED"; data: UserScopedEventData }
  | { type: "INVENTORY_ITEM_TRANSFERRED"; data: UserScopedEventData }
  | { type: "GAME_SESSION_STARTED"; data: unknown }
  | { type: "GAME_SESSION_ENDED"; data: unknown }
  | { type: "ERROR_OCCURRED"; data: { message?: string } }

/** Trailing debounce so bursts of invalidation collapse into one refetch. */
const REQUEST_DEBOUNCE_MS = 150

const debouncedRequest = createTrailingDebounce(() => {
  emitToSocket("GET_MY_GAME_STATE", {})
}, REQUEST_DEBOUNCE_MS)

let subscriptionCounter = 0

export const userGameStateMachine = setup({
  types: {
    context: {} as UserGameStateContext,
    events: {} as UserGameStateEvent,
  },
  guards: {
    /** Room-wide game/inventory events name their subject; skip everyone else's. */
    isMyGameEvent: ({ event }) => {
      const data = (event as { data?: UserScopedEventData }).data
      return isGameEventForUser(data, getCurrentUser()?.userId)
    },
  },
  actions: {
    subscribe: assign(({ self }) => {
      const id = `userGameState-${self.id}-${++subscriptionCounter}`
      subscribeById(id, {
        send: (event) => self.send(event as UserGameStateEvent),
        eventTypes: [
          "INIT",
          "USER_GAME_STATE",
          "USER_GAME_STATE_INVALIDATED",
          "ERROR_OCCURRED",
          "GAME_SESSION_STARTED",
          "GAME_SESSION_ENDED",
          "GAME_STATE_CHANGED",
          "GAME_MODIFIER_APPLIED",
          "GAME_MODIFIER_REMOVED",
          "INVENTORY_ITEM_ACQUIRED",
          "INVENTORY_ITEM_REMOVED",
          "INVENTORY_ITEM_USED",
          "INVENTORY_ITEM_TRANSFERRED",
        ],
      })
      return { subscriptionId: id }
    }),
    unsubscribe: ({ context }) => {
      if (context.subscriptionId) {
        unsubscribeById(context.subscriptionId)
      }
      debouncedRequest.cancel()
    },
    /** Immediate request (ACTIVATE / REFRESH / INIT) — no debounce. */
    requestGameState: () => {
      debouncedRequest.cancel()
      emitToSocket("GET_MY_GAME_STATE", {})
    },
    /** Debounced request for socket-driven invalidation bursts. */
    scheduleRequestGameState: () => {
      debouncedRequest.schedule()
    },
    setPayload: assign(({ event }) => {
      if (event.type !== "USER_GAME_STATE") return {}
      const d = event.data
      return {
        payload: {
          session: d.session,
          state: d.state,
          inventory: d.inventory,
          itemDefinitions: d.itemDefinitions ?? [],
          pluginUserState: d.pluginUserState ?? {},
        },
        error: null,
      }
    }),
    clearPayload: assign({
      payload: () => ({
        session: null,
        state: null,
        inventory: null,
        itemDefinitions: [],
        pluginUserState: {},
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
        USER_GAME_STATE_INVALIDATED: {
          actions: ["scheduleRequestGameState"],
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
        USER_GAME_STATE_INVALIDATED: {
          actions: ["scheduleRequestGameState"],
        },
        GAME_SESSION_STARTED: {
          actions: ["requestGameState"],
        },
        GAME_SESSION_ENDED: {
          actions: ["clearPayload"],
        },
        GAME_STATE_CHANGED: {
          guard: "isMyGameEvent",
          actions: ["scheduleRequestGameState"],
        },
        GAME_MODIFIER_APPLIED: {
          guard: "isMyGameEvent",
          actions: ["scheduleRequestGameState"],
        },
        GAME_MODIFIER_REMOVED: {
          guard: "isMyGameEvent",
          actions: ["scheduleRequestGameState"],
        },
        INVENTORY_ITEM_ACQUIRED: {
          guard: "isMyGameEvent",
          actions: ["scheduleRequestGameState"],
        },
        INVENTORY_ITEM_REMOVED: {
          guard: "isMyGameEvent",
          actions: ["scheduleRequestGameState"],
        },
        INVENTORY_ITEM_USED: {
          guard: "isMyGameEvent",
          actions: ["scheduleRequestGameState"],
        },
        INVENTORY_ITEM_TRANSFERRED: {
          guard: "isMyGameEvent",
          actions: ["scheduleRequestGameState"],
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
        USER_GAME_STATE_INVALIDATED: {
          actions: ["scheduleRequestGameState"],
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
