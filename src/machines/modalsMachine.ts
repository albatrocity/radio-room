import { createMachine } from "xstate"

import { useAuthStore } from "../state/authStore"

export const modalsMachine = createMachine(
  {
    predictableActionArguments: true,
    id: "modals",
    initial: "closed",
    on: {
      EDIT_USERNAME: "username",
      EDIT_QUEUE: { target: "queue", cond: "canAddToQueue" },
      EDIT_ARTWORK: {
        target: "artwork",
        cond: "isAdmin",
      },
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
      // CONFIRM_CLEAR_PLAYLIST: {
      //   actions: ["clearPlaylist"],
      //   cond: "isAdmin",
      // },
      CLOSE: {
        target: "closed",
      },
    },
    states: {
      closed: {},
      username: {},
      queue: {},
      listeners: {},
      help: {},
      artwork: {},
      settings: {},
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
        // TOOD: Implement
        return isAdmin || true
      },
    },
    actions: {},
  },
)
