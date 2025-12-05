import { setup } from "xstate"

import { getIsAdmin } from "../actors/authActor"
import { emitToSocket } from "../actors/socketActor"
import { canAddToQueue as canDjAddToQueue } from "../actors/djActor"

type Context = {}

export type Event =
  | { type: "EDIT_USERNAME" }
  | { type: "EDIT_QUEUE" }
  | { type: "EDIT_SETTINGS" }
  | { type: "VIEW_HELP" }
  | { type: "VIEW_BOOKMARKS" }
  | { type: "VIEW_LISTENERS" }
  | { type: "CLOSE" }
  | { type: "CREATE_ROOM" }
  | { type: "BACK" }
  | { type: "EDIT_CONTENT" }
  | { type: "EDIT_CHAT" }
  | { type: "EDIT_DJ" }
  | { type: "EDIT_SPOTIFY" }
  | { type: "EDIT_PASSWORD" }
  | { type: "EDIT_PLAYLIST_DEMOCRACY" }
  | { type: "EDIT_SPECIAL_WORDS" }
  | { type: "NEXT" }
  | { type: "NUKE_USER" }

export const modalsMachine = setup({
  types: {
    context: {} as Context,
    events: {} as Event,
  },
  guards: {
    isAdmin: () => {
      return getIsAdmin()
    },
    canAddToQueue: () => {
      const isAdmin = getIsAdmin()
      const isDjOrDeputy = canDjAddToQueue()
      return isAdmin || isDjOrDeputy
    },
  },
  actions: {
    fetchSettings: () => {
      emitToSocket("GET_ROOM_SETTINGS", {})
    },
  },
}).createMachine({
  id: "modals",
  initial: "closed",
  context: {},
  on: {
    EDIT_USERNAME: ".username",
    EDIT_QUEUE: { target: ".queue", guard: "canAddToQueue" },
    EDIT_SETTINGS: {
      target: ".settings",
      guard: "isAdmin",
    },
    VIEW_HELP: {
      target: ".help",
    },
    VIEW_BOOKMARKS: {
      target: ".bookmarks",
      guard: "isAdmin",
    },
    VIEW_LISTENERS: {
      target: ".listeners",
    },
    CLOSE: {
      target: ".closed",
    },
    CREATE_ROOM: ".createRoom",
    NUKE_USER: ".nukeUser",
  },
  states: {
    closed: {},
    username: {},
    queue: {},
    listeners: {},
    help: {},
    createRoom: {},
    settings: {
      entry: ["fetchSettings"],
      initial: "overview",
      states: {
        overview: {
          on: {
            EDIT_CONTENT: "content",
            EDIT_CHAT: "chat",
            EDIT_DJ: "dj",
            EDIT_SPOTIFY: "spotify",
            EDIT_PASSWORD: "password",
            EDIT_PLAYLIST_DEMOCRACY: "playlist_democracy",
            EDIT_SPECIAL_WORDS: "special_words",
          },
        },
        playlist_democracy: {
          on: {
            BACK: "overview",
          },
        },
        special_words: {
          on: {
            BACK: "overview",
          },
        },
        content: {
          on: {
            BACK: "overview",
          },
        },
        chat: {
          on: {
            BACK: "overview",
          },
        },
        dj: {
          on: {
            BACK: "overview",
          },
        },
        spotify: {
          on: {
            BACK: "overview",
          },
        },
        password: {
          on: {
            BACK: "overview",
          },
        },
        reaction_triggers: {
          on: {
            BACK: "overview",
          },
        },
        message_triggers: {
          on: {
            BACK: "overview",
          },
        },
      },
    },
    bookmarks: {},
    nukeUser: {},
  },
})
