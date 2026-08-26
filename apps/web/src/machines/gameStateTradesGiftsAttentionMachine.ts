import { assign, setup } from "xstate"

export interface GameStateTradesGiftsAttentionContext {
  unseen: boolean
}

export type GameStateTradesGiftsAttentionEvent =
  | { type: "MARK_UNSEEN" }
  | { type: "TAB_VIEWED" }
  | { type: "RESET" }

export const gameStateTradesGiftsAttentionMachine = setup({
  types: {
    context: {} as GameStateTradesGiftsAttentionContext,
    events: {} as GameStateTradesGiftsAttentionEvent,
  },
}).createMachine({
  id: "gameStateTradesGiftsAttention",
  context: { unseen: false },
  on: {
    MARK_UNSEEN: {
      actions: assign({ unseen: () => true }),
    },
    TAB_VIEWED: {
      actions: assign({ unseen: () => false }),
    },
    RESET: {
      actions: assign({ unseen: () => false }),
    },
  },
})
