import { setup, assign } from "xstate"

interface Context {
  newMessages: number
}

type ScrollFollowEvent =
  | { type: "ATTACH" }
  | { type: "DETACH" }
  | { type: "MESSAGE_RECEIVED" }

export const scrollFollowMachine = setup({
  types: {
    context: {} as Context,
    events: {} as ScrollFollowEvent,
  },
  actions: {
    clearMessages: assign({
      newMessages: 0,
    }),
    incrementMessages: assign(({ context }) => ({
      newMessages: context.newMessages + 1,
    })),
  },
}).createMachine({
  id: "scrollFollow",
  initial: "detached",
  context: {
    newMessages: 0,
  },
  states: {
    attached: {
      on: { DETACH: "detached" },
    },
    detached: {
      on: {
        ATTACH: { target: "attached", actions: ["clearMessages"] },
        MESSAGE_RECEIVED: { actions: ["incrementMessages"] },
      },
    },
  },
})
