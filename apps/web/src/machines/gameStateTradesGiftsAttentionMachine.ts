import { assign, setup } from "xstate"

export interface GameStateTradesGiftsAttentionContext {
  unseen: boolean
  /** Counterpart accepted / locked / confirmed while the trade session was not open. */
  sessionUnseen: boolean
}

export type GameStateTradesGiftsAttentionEvent =
  | { type: "MARK_UNSEEN" }
  | { type: "MARK_SESSION_UNSEEN" }
  | { type: "TAB_VIEWED" }
  | { type: "SESSION_VIEWED" }
  | { type: "RESET" }

export const gameStateTradesGiftsAttentionMachine = setup({
  types: {
    context: {} as GameStateTradesGiftsAttentionContext,
    events: {} as GameStateTradesGiftsAttentionEvent,
  },
  actions: {
    markUnseen: assign({ unseen: () => true }),
    markSessionUnseen: assign({ sessionUnseen: () => true }),
    clearUnseen: assign({ unseen: () => false }),
    clearSessionUnseen: assign({ sessionUnseen: () => false }),
    resetAttention: assign({ unseen: () => false, sessionUnseen: () => false }),
  },
}).createMachine({
  id: "gameStateTradesGiftsAttention",
  context: { unseen: false, sessionUnseen: false },
  on: {
    MARK_UNSEEN: {
      actions: "markUnseen",
    },
    MARK_SESSION_UNSEEN: {
      actions: "markSessionUnseen",
    },
    TAB_VIEWED: {
      actions: "clearUnseen",
    },
    SESSION_VIEWED: {
      actions: "clearSessionUnseen",
    },
    RESET: {
      actions: "resetAttention",
    },
  },
})
