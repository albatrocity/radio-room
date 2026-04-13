import { setup, assign } from "xstate"
import { subscribeById, unsubscribeById } from "../actors"

interface Context {
  newMessages: number
  subscriptionId: string | null
}

type ScrollFollowEvent =
  | { type: "ATTACH" }
  | { type: "DETACH" }
  | { type: "MESSAGE_RECEIVED"; data?: unknown }

export const scrollFollowMachine = setup({
  types: {
    context: {} as Context,
    events: {} as ScrollFollowEvent,
  },
  actions: {
    subscribe: assign(({ self }) => {
      const id = `scrollFollow-${self.id}`
      subscribeById(id, { send: (event) => self.send(event as ScrollFollowEvent) })
      return { subscriptionId: id }
    }),
    unsubscribe: ({ context }) => {
      if (context.subscriptionId) {
        unsubscribeById(context.subscriptionId)
      }
    },
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
    subscriptionId: null,
  },
  entry: ["subscribe"],
  exit: ["unsubscribe"],
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
