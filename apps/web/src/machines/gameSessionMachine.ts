import type { GameSession } from "@repo/types"
import { setup, assign } from "xstate"
import { subscribeById, unsubscribeById } from "../actors/socketActor"

interface GameSessionContext {
  subscriptionId: string | null
  /** ID of the active session, or null if none. */
  activeSessionId: string | null
  /** Optional name for nicer rendering on the UI button (tooltip / aria). */
  activeSessionName: string | null
}

type GameSessionEvent =
  | { type: "ACTIVATE" }
  | { type: "DEACTIVATE" }
  | {
      type: "GAME_SESSION_STARTED"
      data: { roomId: string; sessionId: string; config: { name?: string } }
    }
  | {
      type: "GAME_SESSION_ENDED"
      data: { roomId: string; sessionId: string }
    }
  | {
      type: "USER_GAME_STATE"
      data: { session: { id: string; config?: { name?: string } } | null }
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
      subscribeById(id, { send: (event) => self.send(event as GameSessionEvent) })
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
      }
    }),
    setSessionFromStarted: assign(({ event }) => {
      if (event.type !== "GAME_SESSION_STARTED") return {}
      return {
        activeSessionId: event.data.sessionId,
        activeSessionName: event.data.config?.name ?? null,
      }
    }),
    setSessionFromStatus: assign(({ event }) => {
      if (event.type !== "USER_GAME_STATE") return {}
      const s = event.data.session
      return {
        activeSessionId: s?.id ?? null,
        activeSessionName: s?.config?.name ?? null,
      }
    }),
    clearSession: assign({
      activeSessionId: () => null,
      activeSessionName: () => null,
    }),
    reset: assign({
      subscriptionId: () => null,
      activeSessionId: () => null,
      activeSessionName: () => null,
    }),
  },
}).createMachine({
  id: "gameSession",
  initial: "idle",
  context: {
    subscriptionId: null,
    activeSessionId: null,
    activeSessionName: null,
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
        USER_GAME_STATE: {
          actions: ["setSessionFromStatus"],
        },
      },
    },
  },
})
