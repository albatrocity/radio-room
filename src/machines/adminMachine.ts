import { createMachine, sendTo } from "xstate"
import socketService from "../lib/socketService"

import { useAuthStore } from "../state/authStore"

export const adminMachine = createMachine(
  {
    predictableActionArguments: true,
    id: "admin",
    invoke: [
      {
        id: "socket",
        src: () => socketService,
      },
    ],
    on: {
      SET_COVER: { actions: ["setCover"], cond: "isAdmin" },
      SET_SETTINGS: { actions: ["setSettings"], cond: "isAdmin" },
      CLEAR_PLAYLIST: { actions: ["clearPlaylist"], cond: "isAdmin" },
    },
  },
  {
    guards: {
      isAdmin: () => {
        return useAuthStore.getState().state.context.isAdmin
      },
    },
    actions: {
      fixMeta: sendTo("socket", (_ctx, event) => {
        return {
          type: "fix meta",
          data: event.data,
        }
      }),
      setCover: sendTo("socket", (_ctx, event) => {
        return {
          type: "set cover",
          data: event.data,
        }
      }),
      setSettings: sendTo("socket", (_ctx, event) => {
        return {
          type: "settings",
          data: event.data,
        }
      }),
      clearPlaylist: sendTo("socket", () => {
        return { type: "clear playlist", data: {} }
      }),
    },
  },
)
