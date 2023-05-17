import { createMachine, assign, sendTo } from "xstate"
import socketService from "../lib/socketService"

interface Context {
  reactions: any[]
  messages: any[]
}

export const triggerEventsMachine = createMachine<Context>(
  {
    predictableActionArguments: true,
    id: "triggerEvents",
    context: {
      reactions: [],
      messages: [],
    },
    invoke: [
      {
        id: "socket",
        src: () => socketService,
      },
    ],
    on: {
      TRIGGER_EVENTS: {
        actions: ["setValues"],
      },
      SET_REACTION_TRIGGER_EVENTS: {
        actions: ["submitReactionEvents"],
      },
    },
    initial: "active",
    states: {
      active: {
        entry: ["fetchTriggerEvents"],
      },
    },
  },
  {
    actions: {
      setValues: assign((_context, event) => {
        return event.data
      }),
      fetchTriggerEvents: sendTo("socket", () => ({
        type: "get trigger events",
      })),
      submitReactionEvents: sendTo("socket", (_ctx, event) => {
        return {
          type: "set reaction trigger events",
          data: event.data,
        }
      }),
    },
  },
)
