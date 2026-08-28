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
}).createMachine({
  id: "gameStateTradesGiftsAttention",
  context: { unseen: false, sessionUnseen: false },
  on: {
    MARK_UNSEEN: {
      actions: assign({ unseen: () => true }),
    },
    MARK_SESSION_UNSEEN: {
      actions: assign({ sessionUnseen: () => true }),
    },
    TAB_VIEWED: {
      actions: assign({ unseen: () => false }),
    },
    SESSION_VIEWED: {
      actions: assign({ sessionUnseen: () => false }),
    },
    RESET: {
      actions: assign({ unseen: () => false, sessionUnseen: () => false }),
    },
  },
})
