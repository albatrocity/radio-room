import { createMachine, sendTo } from "xstate"

import socketService from "../lib/socketService"
import { toast } from "../lib/toasts"
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
      SET_SETTINGS: { actions: ["setSettings", "notify"], cond: "isAdmin" },
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
      setSettings: sendTo("socket", (_ctx, event) => {
        return {
          type: "set room settings",
          data: event.data,
        }
      }),
      clearPlaylist: sendTo("socket", () => {
        return { type: "clear playlist", data: {} }
      }),
      notify: () => {
        toast({
          title: "Settings updated",
          status: "success",
          duration: 3000,
          isClosable: true,
        })
      },
    },
  },
)
