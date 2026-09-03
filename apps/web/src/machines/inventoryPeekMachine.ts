/**
 * Peek request lifecycle for `PEEK_USER_INVENTORY` (ADR 0147 / 0149).
 *
 * Owns only the request: which user is being looked at, whether the reply is
 * outstanding, and what came back. Mode ("select" vs "view") stays a prop on
 * the component — it does not vary over the life of a request.
 *
 * Explicit states make the impossible combinations unrepresentable: rows can
 * only exist in `loaded`, and an error can only exist in `error`.
 */

import { assign, setup } from "xstate"
import type { UserInventoryPeekItem, UserInventoryPeekResult } from "@repo/types"

export interface InventoryPeekContext {
  targetUserId: string | null
  /** Non-empty only in the `loaded` state. */
  items: UserInventoryPeekItem[]
  /** Non-null only in the `error` state. */
  error: string | null
}

export type InventoryPeekEvent =
  | { type: "PEEK"; targetUserId: string }
  | { type: "RESULT"; data: UserInventoryPeekResult }
  | { type: "TIMEOUT" }
  | { type: "CLOSE" }

export const inventoryPeekMachine = setup({
  types: {
    context: {} as InventoryPeekContext,
    events: {} as InventoryPeekEvent,
  },
  actions: {
    setTarget: assign({
      targetUserId: ({ event }) => (event.type === "PEEK" ? event.targetUserId : null),
      items: () => [],
      error: () => null,
    }),
    reset: assign({
      targetUserId: () => null,
      items: () => [],
      error: () => null,
    }),
    setItems: assign({
      items: ({ event }) =>
        event.type === "RESULT" && event.data.success ? (event.data.items ?? []) : [],
      error: () => null,
    }),
    setDenied: assign({
      items: () => [],
      error: ({ event }) =>
        event.type === "RESULT" && !event.data.success
          ? (event.data.message ?? "Could not peek inventory.")
          : null,
    }),
    setTimedOut: assign({
      items: () => [],
      error: () => "Peek timed out.",
    }),
  },
}).createMachine({
  id: "inventoryPeek",
  context: {
    targetUserId: null,
    items: [],
    error: null,
  },
  initial: "idle",
  states: {
    idle: {
      on: { PEEK: { target: "loading", actions: "setTarget" } },
    },
    loading: {
      on: {
        // A second PEEK restarts the request against the new target.
        PEEK: { target: "loading", actions: "setTarget", reenter: true },
        RESULT: [
          {
            target: "error",
            guard: ({ event }) => !event.data.success,
            actions: "setDenied",
          },
          {
            // Authorized, but they are carrying nothing — a distinct outcome
            // from a denied peek, and never a half-filled `loaded`.
            target: "empty",
            guard: ({ event }) => (event.data.items ?? []).length === 0,
            actions: "setItems",
          },
          { target: "loaded", actions: "setItems" },
        ],
        TIMEOUT: { target: "error", actions: "setTimedOut" },
        CLOSE: { target: "idle", actions: "reset" },
      },
    },
    loaded: {
      on: {
        PEEK: { target: "loading", actions: "setTarget" },
        CLOSE: { target: "idle", actions: "reset" },
      },
    },
    empty: {
      on: {
        PEEK: { target: "loading", actions: "setTarget" },
        CLOSE: { target: "idle", actions: "reset" },
      },
    },
    error: {
      on: {
        PEEK: { target: "loading", actions: "setTarget" },
        CLOSE: { target: "idle", actions: "reset" },
      },
    },
  },
})
