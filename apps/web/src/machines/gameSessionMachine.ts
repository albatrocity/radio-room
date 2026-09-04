import type { EconomyScaleState, GameSession } from "@repo/types"
import { resolveEconomy } from "@repo/game-logic"
import { setup, assign } from "xstate"
import { subscribeById, unsubscribeById } from "../actors/socketActor"

interface GameSessionContext {
  subscriptionId: string | null
  /** ID of the active session, or null if none. */
  activeSessionId: string | null
  /** Optional name for nicer rendering on the UI button (tooltip / aria). */
  activeSessionName: string | null
  /** Session economy scales; identity when null / absent. */
  economy: EconomyScaleState | null
}

type GameSessionEvent =
  | { type: "ACTIVATE" }
  | { type: "DEACTIVATE" }
  | {
      type: "GAME_SESSION_STARTED"
      data: { roomId: string; sessionId: string; config: { name?: string; economy?: EconomyScaleState } }
    }
  | {
      type: "GAME_SESSION_ENDED"
      data: { roomId: string; sessionId: string }
    }
  | {
      type: "GAME_SESSION_CONFIG_UPDATED"
      data: { roomId: string; sessionId: string; config: { name?: string; allowTrading?: boolean; economy?: EconomyScaleState } }
    }
  | {
      type: "GAME_ECONOMY_SCALE_CHANGED"
      data: {
        roomId: string
        sessionId: string
        costScale: number
        earnScale: number
        previous: { costScale: number; earnScale: number }
        updatedBy: "admin" | "plugin"
        reason?: string
      }
    }
  | {
      type: "USER_GAME_STATE"
      data: { session: { id: string; config?: { name?: string; economy?: EconomyScaleState } } | null }
    }
  /** Same broadcast shape as other actors receive after LOGIN — includes `activeGameSession`. */
  | {
      type: "INIT"
      data: { activeGameSession?: GameSession | null }
    }

let subscriptionCounter = 0

export const gameSessionMachine = setup({
  types: {
    context: {} as GameSessionContext,
    events: {} as GameSessionEvent,
  },
  actions: {
    subscribe: assign(({ self }) => {
      const id = `gameSession-${self.id}-${++subscriptionCounter}`
      subscribeById(id, {
        send: (event) => self.send(event as GameSessionEvent),
        eventTypes: [
          "INIT",
          "GAME_SESSION_STARTED",
          "GAME_SESSION_ENDED",
          "GAME_SESSION_CONFIG_UPDATED",
          "GAME_ECONOMY_SCALE_CHANGED",
          "USER_GAME_STATE",
        ],
      })
      return { subscriptionId: id }
    }),
    unsubscribe: ({ context }) => {
      if (context.subscriptionId) {
        unsubscribeById(context.subscriptionId)
      }
    },
    /**
     * Seed from login INIT (AuthService includes `activeGameSession`). Do not call
     * GET_MY_GAME_STATE on entry — that runs before LOGIN and has no `socket.data.roomId`.
     */
    setSessionFromInit: assign(({ event }) => {
      if (event.type !== "INIT") return {}
      const s = event.data.activeGameSession ?? null
      return {
        activeSessionId: s?.id ?? null,
        activeSessionName: s?.config?.name ?? null,
        economy: s?.config?.economy ?? null,
      }
    }),
    setSessionFromStarted: assign(({ event }) => {
      if (event.type !== "GAME_SESSION_STARTED") return {}
      return {
        activeSessionId: event.data.sessionId,
        activeSessionName: event.data.config?.name ?? null,
        economy: event.data.config?.economy ?? null,
      }
    }),
    setSessionFromStatus: assign(({ event }) => {
      if (event.type !== "USER_GAME_STATE") return {}
      const s = event.data.session
      return {
        activeSessionId: s?.id ?? null,
        activeSessionName: s?.config?.name ?? null,
        economy: s?.config?.economy ?? null,
      }
    }),
    setSessionFromConfigUpdated: assign(({ event }) => {
      if (event.type !== "GAME_SESSION_CONFIG_UPDATED") return {}
      return {
        activeSessionId: event.data.sessionId,
        activeSessionName: event.data.config?.name ?? null,
        economy: event.data.config?.economy ?? null,
      }
    }),
    mergeEconomyScale: assign(({ event, context }) => {
      if (event.type !== "GAME_ECONOMY_SCALE_CHANGED") return {}
      const prev = resolveEconomy(context.economy)
      return {
        economy: {
          ...prev,
          costScale: event.data.costScale,
          earnScale: event.data.earnScale,
          updatedBy: event.data.updatedBy,
          reason: event.data.reason,
        },
      }
    }),
    clearSession: assign({
      activeSessionId: () => null,
      activeSessionName: () => null,
      economy: () => null,
    }),
    reset: assign({
      subscriptionId: () => null,
      activeSessionId: () => null,
      activeSessionName: () => null,
      economy: () => null,
    }),
  },
}).createMachine({
  id: "gameSession",
  initial: "idle",
  context: {
    subscriptionId: null,
    activeSessionId: null,
    activeSessionName: null,
    economy: null,
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
          actions: ["reset"],
        },
        INIT: {
          actions: ["setSessionFromInit"],
        },
        GAME_SESSION_STARTED: {
          actions: ["setSessionFromStarted"],
        },
        GAME_SESSION_ENDED: {
          actions: ["clearSession"],
        },
        GAME_SESSION_CONFIG_UPDATED: {
          actions: ["setSessionFromConfigUpdated"],
        },
        GAME_ECONOMY_SCALE_CHANGED: {
          actions: ["mergeEconomyScale"],
        },
        USER_GAME_STATE: {
          actions: ["setSessionFromStatus"],
        },
      },
    },
  },
})
