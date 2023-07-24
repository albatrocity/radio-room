import { createMachine } from "xstate"

import { useAuthStore } from "../state/authStore"
import { useDjStore } from "../state/djStore"

type Context = {}

export type Event =
  | {
      type: "EDIT_USERNAME"
    }
  | {
      type: "EDIT_QUEUE"
    }
  | {
      type: "EDIT_SETTINGS"
    }
  | {
      type: "VIEW_HELP"
    }
  | {
      type: "VIEW_BOOKMARKS"
    }
  | {
      type: "VIEW_LISTENERS"
    }
  | {
      type: "CLOSE"
    }
  | {
      type: "CREATE_ROOM"
    }
  | {
      type: "BACK"
    }
  | {
      type: "EDIT_CONTENT"
    }
  | {
      type: "EDIT_DJ"
    }
  | {
      type: "EDIT_SPOTIFY"
    }
  | {
      type: "EDIT_PASSWORD"
    }
  | {
      type: "EDIT_REACTION_TRIGGERS"
    }
  | {
      type: "EDIT_MESSAGE_TRIGGERS"
    }
  | {
      type: "NEXT"
    }

export const modalsMachine = createMachine<Context, Event>(
  {
    predictableActionArguments: true,
    id: "modals",
    initial: "closed",
    on: {
      EDIT_USERNAME: "username",
      EDIT_QUEUE: { target: "queue", cond: "canAddToQueue" },
      EDIT_SETTINGS: {
        target: "settings",
        cond: "isAdmin",
      },
      VIEW_HELP: {
        target: "help",
      },
      VIEW_BOOKMARKS: {
        target: "bookmarks",
        cond: "isAdmin",
      },
      VIEW_LISTENERS: {
        target: "listeners",
      },
      CLOSE: {
        target: "closed",
      },
      CREATE_ROOM: "createRoom",
    },
    states: {
      closed: {},
      username: {},
      queue: {},
      listeners: {},
      help: {},
      createRoom: {},
      settings: {
        initial: "overview",
        states: {
          overview: {
            on: {
              EDIT_CONTENT: "content",
              EDIT_DJ: "dj",
              EDIT_SPOTIFY: "spotify",
              EDIT_PASSWORD: "password",
              EDIT_REACTION_TRIGGERS: "reaction_triggers",
              EDIT_MESSAGE_TRIGGERS: "message_triggers",
            },
          },
          content: {
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
    },
  },
  {
    guards: {
      isAdmin: () => {
        return useAuthStore.getState().state.context.isAdmin
      },
      canAddToQueue: () => {
        const isAdmin = useAuthStore.getState().state.context.isAdmin
        const isDj = useDjStore.getState().state.matches("deputyDjaying")
        const isDeputyDj = useDjStore.getState().state.matches("djaying")

        return isAdmin || isDj || isDeputyDj
      },
    },
    actions: {},
  },
)
