import { createMachine, sendTo } from "xstate"
import socketService from "../lib/socketService"

import { useAuthStore } from "../state/authStore"

type AdminEvent = {
  type: string
  data?: any
  userId?: string
}

export const adminMachine = createMachine<any, AdminEvent>(
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
      DEPUTIZE_DJ: { actions: ["deputizeDj"], cond: "isAdmin" },
    },
  },
  {
    guards: {
      isAdmin: () => {
        return useAuthStore.getState().state.context.isAdmin
      },
    },
    actions: {
      deputizeDj: sendTo("socket", (_ctx, event) => {
        return {
          type: "dj deputize user",
          data: event.userId,
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
