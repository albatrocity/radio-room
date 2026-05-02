/**
 * Room Game State Machine
 *
 * Holds the active game session's modifier state for *every* participant in
 * the current room, indexed by userId. Used by per-user effect bar UIs that
 * need to reflect any user's status, not just the current user's.
 *
 * Hydration:
 * - On ACTIVATE: subscribe and emit `GET_ROOM_GAME_STATE` for a one-shot snapshot.
 * - On INIT (post-LOGIN race fix) and GAME_SESSION_STARTED: re-snapshot.
 *
 * Incremental updates:
 * - `GAME_MODIFIER_APPLIED { userId, modifier }` — push or replace by id.
 * - `GAME_MODIFIER_REMOVED { userId, modifierId }` — drop by id.
 *
 * Lifecycle:
 * - `GAME_SESSION_ENDED`: clear all per-user modifiers.
 * - DEACTIVATE: unsubscribe + reset.
 */

import type { GameStateModifier } from "@repo/types"
import { setup, assign } from "xstate"
import { emitToSocket, subscribeById, unsubscribeById } from "../actors/socketActor"

interface RoomGameStateContext {
  subscriptionId: string | null
  sessionId: string | null
  modifiersByUserId: Record<string, GameStateModifier[]>
}

export interface RoomGameStateSnapshot {
  sessionId: string | null
  modifiersByUserId: Record<string, GameStateModifier[]>
}

type RoomGameStateEvent =
  | { type: "ACTIVATE" }
  | { type: "DEACTIVATE" }
  /** After LOGIN the socket has `roomId`; re-fetch so GET_ROOM_GAME_STATE is not lost to the pre-login timing race. */
  | { type: "INIT"; data?: unknown }
  | { type: "ROOM_GAME_STATE"; data: RoomGameStateSnapshot }
  | {
      type: "GAME_MODIFIER_APPLIED"
      data: { userId: string; modifier: GameStateModifier }
    }
  | {
      type: "GAME_MODIFIER_REMOVED"
      data: { userId: string; modifierId: string }
    }
  | { type: "GAME_SESSION_STARTED"; data?: unknown }
  | { type: "GAME_SESSION_ENDED"; data?: unknown }

let subscriptionCounter = 0

export const roomGameStateMachine = setup({
  types: {
    context: {} as RoomGameStateContext,
    events: {} as RoomGameStateEvent,
  },
  actions: {
    subscribe: assign(({ self }) => {
      const id = `roomGameState-${self.id}-${++subscriptionCounter}`
      subscribeById(id, { send: (event) => self.send(event as RoomGameStateEvent) })
      return { subscriptionId: id }
    }),
    unsubscribe: ({ context }) => {
      if (context.subscriptionId) {
        unsubscribeById(context.subscriptionId)
      }
    },
    requestSnapshot: () => {
      emitToSocket("GET_ROOM_GAME_STATE", {})
    },
    setSnapshot: assign(({ event }) => {
      if (event.type !== "ROOM_GAME_STATE") return {}
      return {
        sessionId: event.data.sessionId ?? null,
        modifiersByUserId: event.data.modifiersByUserId ?? {},
      }
    }),
    applyModifier: assign(({ context, event }) => {
      if (event.type !== "GAME_MODIFIER_APPLIED") return {}
      const { userId, modifier } = event.data
      if (!userId || !modifier) return {}
      const existing = context.modifiersByUserId[userId] ?? []
      const replaced = existing.filter((m) => m.id !== modifier.id)
      replaced.push(modifier)
      return {
        modifiersByUserId: {
          ...context.modifiersByUserId,
          [userId]: replaced,
        },
      }
    }),
    removeModifier: assign(({ context, event }) => {
      if (event.type !== "GAME_MODIFIER_REMOVED") return {}
      const { userId, modifierId } = event.data
      if (!userId || !modifierId) return {}
      const existing = context.modifiersByUserId[userId]
      if (!existing) return {}
      const next = existing.filter((m) => m.id !== modifierId)
      const nextMap = { ...context.modifiersByUserId }
      if (next.length === 0) {
        delete nextMap[userId]
      } else {
        nextMap[userId] = next
      }
      return { modifiersByUserId: nextMap }
    }),
    clearModifiers: assign({
      sessionId: () => null,
      modifiersByUserId: () => ({}),
    }),
    reset: assign({
      subscriptionId: () => null,
      sessionId: () => null,
      modifiersByUserId: () => ({}),
    }),
  },
}).createMachine({
  id: "roomGameState",
  initial: "idle",
  context: {
    subscriptionId: null,
    sessionId: null,
    modifiersByUserId: {},
  },
  states: {
    idle: {
      on: {
        ACTIVATE: "ready",
      },
    },
    ready: {
      entry: ["subscribe", "requestSnapshot"],
      on: {
        DEACTIVATE: {
          target: "idle",
          actions: ["unsubscribe", "reset"],
        },
        INIT: {
          actions: ["requestSnapshot"],
        },
        GAME_SESSION_STARTED: {
          actions: ["requestSnapshot"],
        },
        GAME_SESSION_ENDED: {
          actions: ["clearModifiers"],
        },
        ROOM_GAME_STATE: {
          actions: ["setSnapshot"],
        },
        GAME_MODIFIER_APPLIED: {
          actions: ["applyModifier"],
        },
        GAME_MODIFIER_REMOVED: {
          actions: ["removeModifier"],
        },
      },
    },
  },
})
