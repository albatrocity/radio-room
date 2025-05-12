import { createMachine, sendTo, assign } from "xstate"
import socketService from "../lib/socketService"
import { handleNotifications } from "../lib/handleNotifications"
import { uniqBy } from "lodash/fp"
import { User } from "../types/User"
import { ChatMessage } from "../types/ChatMessage"
import { PlaylistItem } from "../types/PlaylistItem"
import { ReactionsContext } from "./allReactionsMachine"
import { Room } from "../types/Room"
import { getCurrentUser } from "../state/authStore"

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

type SetDataEvent =
  | {
      type: "INIT" | "SET_MESSAGES"
      data: {
        currentUser: User
        messages: ChatMessage[]
        meta: {}
        playlist: PlaylistItem[]
        reactions: ReactionsContext
        users: User[]
      }
    }
  | {
      type: "ROOM_DATA"
      data: {
        messages: ChatMessage[]
        room: Room
        playlist: PlaylistItem[]
      }
    }

type MachineEvent =
  | NewMessageEvent
  | SetDataEvent
  | ResetEvent
  | TypingEvent
  | SubmitMessageAction

interface Context {
  messages: ChatMessage[]
}

export const chatMachine = createMachine<Context, MachineEvent>(
  {
    predictableActionArguments: true,
    id: "chat",
    initial: "unauthenticated",
    context: {
      messages: [],
    },
    on: {
      INIT: {
        actions: ["setData"],
      },
      ROOM_DATA: {
        actions: ["addMessages"],
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
        if (event.type === "SUBMIT_MESSAGE") {
          return { type: "new message", data: event.data }
        }
        return null
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
            return uniqBy("timestamp", [...context.messages, event.data])
          }
          return context.messages
        },
      }),
      addMessages: assign({
        messages: (context, event) => {
          if (event.type === "ROOM_DATA") {
            return uniqBy("timestamp", [
              ...context.messages,
              ...event.data.messages,
            ])
          }
          return context.messages
        },
      }),
      handleNotifications: (_ctx, event) => {
        if (event.type === "NEW_MESSAGE") {
          handleNotifications(event.data, getCurrentUser())
        }
      },
      setData: assign({
        messages: (ctx, event) => {
          if (event.type === "INIT" || event.type === "SET_MESSAGES") {
            return event.data.messages || []
          }
          return ctx.messages
        },
      }),
    },
  },
)
