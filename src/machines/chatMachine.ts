import { createMachine, sendTo, assign } from "xstate"
import socketService from "../lib/socketService"
import { handleNotifications } from "../lib/handleNotifications"
import { take, concat, uniqBy } from "lodash/fp"
import { User } from "../types/User"
import { ChatMessage } from "../types/ChatMessage"
import { PlaylistItem } from "../types/PlaylistItem"
import { ReactionsContext } from "./allReactionsMachine"

type NewMessageEvent = {
  type: "NEW_MESSAGE"
  data: ChatMessage
}

type ResetEvent = {
  type: "CLEAR_MESSAGES"
}

type TypingEvent = {
  type: "START_TYPING" | "STOP_TYPING"
}

type SubmitMessageAction = {
  type: "SUBMIT_MESSAGE"
  data: ChatMessage["content"]
}

type SetDataEvent = {
  type: "INIT" | "LOGIN" | "SET_MESSAGES"
  data: {
    currentUser: User
    messages: ChatMessage[]
    meta: {}
    playlist: PlaylistItem[]
    reactions: ReactionsContext
    users: User[]
  }
}

type SetCurrentUserEvent = {
  type: "SET_CURRENT_USER"
  data: {
    username: User["username"]
    userId: User["userId"]
    password: string
    isAdmin: boolean
  }
}

type MachineEvent =
  | NewMessageEvent
  | SetCurrentUserEvent
  | SetDataEvent
  | ResetEvent
  | TypingEvent
  | SubmitMessageAction

interface Context {
  messages: ChatMessage[]
  currentUser: User | null
}

export const chatMachine = createMachine<Context, MachineEvent>(
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
      SET_CURRENT_USER: {
        actions: ["setCurrentUser"],
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
          SET_MESSAGES: { actions: ["setData"] },
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
      sendMessage: sendTo("socket", (_ctx, event) => {
        return { type: "new message", data: event.data }
      }),
      startTyping: sendTo("socket", (_ctx, _event) => {
        return { type: "typing" }
      }),
      stopTyping: sendTo("socket", (_ctx, _event) => {
        return { type: "stop typing" }
      }),
      clearMessages: sendTo("socket", (_ctx, _event) => {
        return { type: "clear messages" }
      }),
      addMessage: assign({
        messages: (context, event) => {
          if (event.type === "NEW_MESSAGE") {
            return uniqBy(
              "timestamp",
              take(60, concat(event.data, context.messages)),
            )
          }
          return context.messages
        },
      }),
      handleNotifications: (ctx, event) => {
        if (event.type === "NEW_MESSAGE") {
          handleNotifications(event.data, ctx.currentUser)
        }
      },
      setData: assign({
        messages: (ctx, event) => {
          if (event.type === "INIT") {
            return event.data.messages || []
          }
          return ctx.messages
        },
        currentUser: (ctx, event) => {
          if (event.type === "INIT") {
            event.data.currentUser || null
          }
          return ctx.currentUser
        },
      }),
      setCurrentUser: assign({
        currentUser: (context, event) => {
          if (event.type === "SET_CURRENT_USER") {
            return event.data ? event.data : context.currentUser
          } else {
            return context.currentUser
          }
        },
      }),
    },
  },
)
