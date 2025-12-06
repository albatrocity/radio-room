import { setup, assign } from "xstate"
import { handleNotifications } from "../lib/handleNotifications"
import { uniqBy } from "lodash/fp"
import { User } from "../types/User"
import { ChatMessage } from "../types/ChatMessage"
import { PlaylistItem } from "../types/PlaylistItem"
import { ReactionsContext } from "./allReactionsMachine"
import { Room } from "../types/Room"
import { getCurrentUser } from "../actors/authActor"
import { emitToSocket, subscribeById, unsubscribeById } from "../actors/socketActor"

// ============================================================================
// Types
// ============================================================================

type NewMessageEvent = {
  type: "MESSAGE_RECEIVED"
  data: {
    roomId: string
    message: ChatMessage
  }
}

type ResetEvent = {
  type: "CLEAR_MESSAGES" | "RESET"
}

type TypingEvent = {
  type: "START_TYPING" | "STOP_TYPING"
}

type SubmitMessageAction = {
  type: "SUBMIT_MESSAGE"
  data: ChatMessage["content"]
}

type LifecycleEvent = {
  type: "ACTIVATE" | "DEACTIVATE"
}

type SetDataEvent =
  | {
      type: "INIT"
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
      type: "MESSAGES_CLEARED"
      data: {
        roomId: string
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
  | LifecycleEvent

export interface ChatContext {
  messages: ChatMessage[]
  subscriptionId: string | null
}

// ============================================================================
// Machine
// ============================================================================

let subscriptionCounter = 0

export const chatMachine = setup({
  types: {
    context: {} as ChatContext,
    events: {} as MachineEvent,
  },
  actions: {
    subscribe: assign(({ self }) => {
      const id = `chat-${self.id}-${++subscriptionCounter}`
      subscribeById(id, { send: (event) => self.send(event as MachineEvent) })
      return { subscriptionId: id }
    }),
    unsubscribe: ({ context }) => {
      if (context.subscriptionId) {
        unsubscribeById(context.subscriptionId)
      }
    },
    sendMessage: ({ event }) => {
      if (event.type === "SUBMIT_MESSAGE") {
        emitToSocket("SEND_MESSAGE", event.data)
      }
    },
    startTyping: () => {
      emitToSocket("START_TYPING", {})
    },
    stopTyping: () => {
      emitToSocket("STOP_TYPING", {})
    },
    clearMessagesAndEmit: () => {
      emitToSocket("CLEAR_MESSAGES", {})
    },
    resetMessages: assign({
      messages: () => [],
      subscriptionId: () => null,
    }),
    addMessage: assign({
      messages: ({ context, event }) => {
        if (event.type === "MESSAGE_RECEIVED") {
          return uniqBy("timestamp", [...context.messages, event.data.message])
        }
        return context.messages
      },
    }),
    addMessages: assign({
      messages: ({ context, event }) => {
        if (event.type === "ROOM_DATA") {
          return uniqBy("timestamp", [...context.messages, ...event.data.messages])
        }
        return context.messages
      },
    }),
    handleNotifications: ({ event }) => {
      if (event.type === "MESSAGE_RECEIVED") {
        handleNotifications(event.data.message, getCurrentUser())
      }
    },
    setData: assign({
      messages: ({ context, event }) => {
        if (event.type === "INIT") {
          return event.data.messages || []
        }
        if (event.type === "MESSAGES_CLEARED") {
          return []
        }
        return context.messages
      },
    }),
  },
}).createMachine({
  id: "chat",
  initial: "idle",
  context: {
    messages: [],
    subscriptionId: null,
  },
  states: {
    // Idle state - not subscribed to socket events
    idle: {
      on: {
        ACTIVATE: "active",
      },
    },
    // Active state - subscribed to socket events
    active: {
      entry: ["subscribe"],
      exit: ["unsubscribe"],
      on: {
        DEACTIVATE: {
          target: "idle",
          actions: ["resetMessages"],
        },
        CLEAR_MESSAGES: {
          actions: ["clearMessagesAndEmit"],
        },
        RESET: {
          actions: ["resetMessages"],
        },
      },
      initial: "unauthenticated",
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
            INIT: {
              actions: ["setData"],
            },
            ROOM_DATA: {
              actions: ["addMessages"],
            },
            SUBMIT_MESSAGE: { actions: ["sendMessage"] },
            MESSAGE_RECEIVED: { actions: ["addMessage", "handleNotifications"] },
            MESSAGES_CLEARED: { actions: ["setData"] },
          },
          states: {
            typing: {
              initial: "inactive",
              id: "typing",
              on: {
                START_TYPING: ".active",
                STOP_TYPING: ".inactive",
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
  },
})
