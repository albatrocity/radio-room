import { createMachine, send, assign } from "xstate"
import socketService from "../lib/socketService"
import { handleNotifications } from "../lib/handleNotifications"
import { take, concat, uniqBy } from "lodash/fp"
import { User } from "../types/User"
import { ChatMessage } from "../types/ChatMessage"

type ChatEvent = {
  data: {
    messages?: {
      content?: string
    }[]
    currentUser?: User
  }
}

interface Context {
  messages: ChatMessage[]
  currentUser: User | null
}

export const chatMachine = createMachine<Context>(
  {
    predictableActionArguments: true,
    id: "chat",
    initial: "unauthenticated",
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
      CLEAR_MESSAGES: {
        actions: ["clearMessages"],
      },
    },
    invoke: [
      {
        id: "socket",
        src: (_ctx, _event) => socketService,
      },
    ],
    states: {
      unauthenticated: {
        on: {
          INIT: {
            target: "ready",
            actions: ["setData"],
          },
        },
      },
      ready: {
        type: "parallel",
        on: {
          SUBMIT_MESSAGE: { actions: ["sendMessage"] },
          NEW_MESSAGE: { actions: ["addMessage", "handleNotifications"] },
          TOGGLE_MESSAGE: { actions: ["toggleMessage"] },
          SET_MESSAGES: { actions: ["setData"] },
          SET_USERS: {
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
        (_ctx, event) => {
          return { type: "new message", data: event.data }
        },
        {
          to: "socket",
        },
      ),
      startTyping: send(
        (_ctx, _event) => {
          return { type: "typing" }
        },
        {
          to: "socket",
        },
      ),
      stopTyping: send(
        (_ctx, _event) => {
          return { type: "stop typing" }
        },
        {
          to: "socket",
        },
      ),
      clearMessages: send(
        (_ctx, _event) => {
          return { type: "clear messages" }
        },
        {
          to: "socket",
        },
      ),
      addMessage: assign({
        messages: (context, event) => {
          return uniqBy(
            "timestamp",
            take(60, concat(event.data, context.messages)),
          )
        },
      }),
      toggleMessage: assign({
        messages: (context, event) => {
          const isPreset = context.messages.includes(event.data)
          if (isPreset) {
            return context.messages.filter(
              (x: ChatMessage) => x.timestamp !== event.data.timestamp,
            )
          }
          return uniqBy(
            "timestamp",
            take(60, concat(event.data, context.messages)),
          )
        },
      }),
      handleNotifications: (ctx, event: ChatEvent) => {
        handleNotifications(event.data, ctx.currentUser)
      },
      setData: assign({
        messages: (_context, event: ChatEvent) => {
          return event.data.messages
        },
        currentUser: (_context, event) => event.data.currentUser,
      }),
      setCurrentUser: assign({
        currentUser: (context, event) => {
          return event.data.currentUser
            ? event.data.currentUser
            : context.currentUser
        },
      }),
    },
  },
)
