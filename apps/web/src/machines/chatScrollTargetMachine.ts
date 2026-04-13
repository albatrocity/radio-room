import { setup, assign } from "xstate"

interface ChatScrollTargetContext {
  targetTimestamp: string | null
  requestId: number
}

export type ChatScrollTargetEvent =
  | { type: "SCROLL_TO_TIMESTAMP"; data: string }
  | { type: "CLEAR_TARGET" }

export const chatScrollTargetMachine = setup({
  types: {
    context: {} as ChatScrollTargetContext,
    events: {} as ChatScrollTargetEvent,
  },
  actions: {
    setScrollTarget: assign(({ context, event }) => {
      if (event.type !== "SCROLL_TO_TIMESTAMP") {
        return {}
      }
      return {
        targetTimestamp: event.data,
        requestId: context.requestId + 1,
      }
    }),
    clearScrollTarget: assign({
      targetTimestamp: () => null,
    }),
  },
}).createMachine({
  id: "chatScrollTarget",
  context: {
    targetTimestamp: null,
    requestId: 0,
  },
  on: {
    SCROLL_TO_TIMESTAMP: { actions: ["setScrollTarget"] },
    CLEAR_TARGET: { actions: ["clearScrollTarget"] },
  },
})
