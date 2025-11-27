import { createMachine } from "xstate"
import { assign } from "xstate/lib/actions"
import socketService from "../lib/socketService"

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
    invoke: [
      {
        id: "socket",
        src: (_ctx, _event) => socketService,
      },
    ],
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
