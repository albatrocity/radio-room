import { Machine, send, assign } from "xstate"
import socketService from "../lib/socketService"
import eventBus from "../lib/eventBus"
import { handleNotifications } from "../lib/handleNotifications"

export const chatMachine = Machine(
  {
    id: "chat",
    initial: "ready",
    context: {
      messages: [],
      currentUser: null,
    },
    on: {
      LOGIN: {
        actions: ["setData"],
      },
      INIT: {
        actions: ["setData"],
      },
    },
    invoke: [
      {
        id: "eventBus",
        src: (ctx, event) => eventBus,
      },
      {
        id: "socket",
        src: (ctx, event) => socketService,
      },
    ],
    states: {
      ready: {
        type: "parallel",
        on: {
          SUBMIT_MESSAGE: { actions: ["sendMessage"] },
          NEW_MESSAGE: { actions: ["addMessage", "handleNotifications"] },
          SET_CURRENT_USER: {
            actions: ["setCurrentUser"],
          },
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
      sendMessage: send(
        (ctx, event) => {
          return { type: "new message", data: event.data }
        },
        {
          to: "socket",
        }
      ),
      startTyping: send(
        (ctx, event) => {
          return { type: "typing" }
        },
        {
          to: "socket",
        }
      ),
      stopTyping: send(
        (ctx, event) => {
          return { type: "stop typing" }
        },
        {
          to: "socket",
        }
      ),
      setTyping: assign((ctx, event) => {
        return { typing: event.data }
      }),
      addMessage: assign({
        messages: (context, event) => {
          return [...context.messages, event.data]
        },
      }),
      handleNotifications: (ctx, event) => {
        handleNotifications(event.data)
      },
      setData: assign({
        messages: (context, event) => {
          return event.data.messages
        },
        typing: (context, event) => {
          return event.data.typing
        },
      }),
      setCurrentUser: assign({
        currentUser: (context, event) => {
          return event.data.currentUser
        },
      }),
    },
  }
)
