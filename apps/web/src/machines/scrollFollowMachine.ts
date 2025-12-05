import { createMachine } from "xstate"
import { assign } from "xstate/lib/actions"

interface Context {
  newMessages: number
}

export const scrollFollowMachine = createMachine<Context>(
  {
    predictableActionArguments: true,
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
  },
  {
    actions: {
      clearMessages: assign({
        newMessages: 0,
      }),
      incrementMessages: assign((ctx) => ({
        newMessages: ctx.newMessages + 1,
      })),
    },
  },
)
