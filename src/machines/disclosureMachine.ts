import { assign, send, createMachine } from "xstate"
import socketService from "../lib/socketService"
import { User } from "../types/User"

interface Context {
  currentUser: User | null
}

export const disclosureMachine = createMachine<Context>(
  {
    predictableActionArguments: true,
    id: "disclosure",
    context: {
      currentUser: null,
    },
    invoke: [
      {
        id: "socket",
        src: () => socketService,
      },
    ],
    type: "parallel",
    states: {
      editing: {
        initial: "none",
        states: {
          none: {},
          username: {},
          preferences: {},
          queue: {},
          meta: {
            on: {
              always: [
                {
                  target: "none",
                  cond: "isAdmin",
                },
              ],
            },
          },
          artwork: {
            on: {
              always: [
                {
                  target: "none",
                  cond: "isAdmin",
                },
              ],
            },
          },
          bookmarks: {
            on: {
              always: [
                {
                  target: "none",
                  cond: "isAdmin",
                },
              ],
            },
          },
          settings: {
            on: {
              always: [
                {
                  target: "none",
                  cond: "isAdmin",
                },
              ],
            },
          },
          listenerSettings: {},
        },
        on: {
          CLOSE_EDIT: ".none",
          EDIT_USERNAME: ".username",
          EDIT_SETTINGS: ".preferences",
          EDIT_QUEUE: ".queue",
          ADMIN_EDIT_META: {
            target: ".meta",
            cond: "isAdmin",
          },
          ADMIN_EDIT_ARTWORK: {
            target: ".artwork",
            cond: "isAdmin",
          },
          ADMIN_EDIT_SETTINGS: {
            target: ".settings",
            cond: "isAdmin",
          },
          ADMIN_BOOKMARKS: {
            target: ".bookmarks",
            cond: "isAdmin",
          },
        },
      },
      modalViewing: {
        initial: "none",
        states: {
          none: {},
          listeners: {},
          help: {},
        },
        on: {
          CLOSE_VIEWING: ".none",
          VIEW_LISTENERS: ".listeners",
          VIEW_HELP: ".help",
        },
      },
    },
  },
  {
    guards: {
      isAdmin: (ctx, event) => {
        return !!ctx.currentUser?.isAdmin
      },
    },
    actions: {},
  },
)
