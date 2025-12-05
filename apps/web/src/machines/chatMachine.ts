import { setup, assign } from "xstate"
import { handleNotifications } from "../lib/handleNotifications"
import { uniqBy } from "lodash/fp"
import { User } from "../types/User"
import { ChatMessage } from "../types/ChatMessage"
import { PlaylistItem } from "../types/PlaylistItem"
import { ReactionsContext } from "./allReactionsMachine"
import { Room } from "../types/Room"
import { getCurrentUser } from "../actors/authActor"
import { emitToSocket } from "../actors/socketActor"

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

type MachineEvent = NewMessageEvent | SetDataEvent | ResetEvent | TypingEvent | SubmitMessageAction

interface Context {
  messages: ChatMessage[]
}

export const chatMachine = setup({
  types: {
    context: {} as Context,
    events: {} as MachineEvent,
  },
  actions: {
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
      actions: ["clearMessagesAndEmit"],
    },
    RESET: {
      actions: ["resetMessages"],
    },
  },
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
})
