import { Machine, assign } from "xstate"

export const chatMachine = Machine(
  {
    id: "chat",
    initial: "ready",
    context: {
      messages: [],
      typing: [],
    },
    on: {
      LOGIN: {
        actions: ["setData"],
      },
    },
    states: {
      ready: {
        type: "parallel",
        activities: ["setupListeners"],
        on: {
          SUBMIT_MESSAGE: { actions: ["sendMessage"] },
          MESSAGE_RECEIVED: { actions: ["addMessage"] },
          TYPING: { actions: ["setTyping"] },
        },
        states: {
          typing: {
            initial: "inactive",
            id: "typing",
            on: {
              START_TYPING: "typing.active",
              STOP_TYPING: "typing.inactive",
            },
            states: {
              active: {
                entry: ["startTyping"],
              },
              inactive: {
                entry: ["stopTyping"],
              },
            },
          },
        },
      },
    },
  },
  {
    actions: {
      setTyping: assign((ctx, event) => {
        return { typing: event.data }
      }),
      addMessage: assign({
        messages: (context, event) => {
          return [...context.messages, event.data]
        },
      }),
      setData: assign({
        messages: (context, event) => {
          return event.data.messages
        },
        typing: (context, event) => {
          return event.data.typing
        },
      }),
    },
  }
)
