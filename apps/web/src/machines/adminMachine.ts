import { createMachine, sendTo } from "xstate"

import socketService from "../lib/socketService"
import { toast } from "../lib/toasts"
import { useAuthStore } from "../state/authStore"
import { deleteRoom as deleteRoomData } from "../lib/serverApi"

type DeleteRoomEvent = {
  type: "DELETE_ROOM"
  data: { id: string }
}

type AdminEvent =
  | {
      type: string
      data?: any
      userId?: string
    }
  | DeleteRoomEvent

async function deleteRoom(_ctx: any, event: AdminEvent) {
  console.log("delete the room", event)
  if (event.type === "DELETE_ROOM") {
    await deleteRoomData(event.data.id)
  }
}

export const adminMachine = createMachine<any, AdminEvent>(
  {
    predictableActionArguments: true,
    id: "admin",
    initial: "idle",
    invoke: [
      {
        id: "socket",
        src: () => socketService,
      },
    ],
    on: {
      SET_SETTINGS: { actions: ["setSettings", "notify"], cond: "isAdmin" },
      CLEAR_PLAYLIST: { actions: ["clearPlaylist"], cond: "isAdmin" },
      DELETE_ROOM: { target: "deleting", cond: "isAdmin" },
      DEPUTIZE_DJ: { actions: ["deputizeDj"], cond: "isAdmin" },
    },
    states: {
      idle: {},
      deleting: {
        invoke: {
          id: "deleteRoom",
          src: deleteRoom,
          onDone: {
            actions: [
              () => {
                toast({
                  title: "Room deleted",
                  description: "Your room has been deleted",
                  status: "success",
                })
              },
              () => {
                window.location.href = "/"
              },
            ],
          },
          onError: {
            actions: () => {
              toast({
                title: "Error deleting room",
                description: "There was an error deleting your room",
                status: "error",
              })
            },
          },
        },
      },
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
        if (event.type !== "DEPUTIZE_DJ") return
        return {
          type: "DEPUTIZE_DJ",
          data: event.userId,
        }
      }),
      setSettings: sendTo("socket", (_ctx, event) => {
        return {
          type: "SET_ROOM_SETTINGS",
          data: event.data,
        }
      }),
      clearPlaylist: sendTo("socket", () => {
        return { type: "CLEAR_PLAYLIST", data: {} }
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
