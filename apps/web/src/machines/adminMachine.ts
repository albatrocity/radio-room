import { createMachine } from "xstate"

import { toast } from "../lib/toasts"
import { getIsAdmin } from "../actors/authActor"
import { emitToSocket } from "../actors/socketActor"
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
        return getIsAdmin()
      },
    },
    actions: {
      deputizeDj: (_ctx, event) => {
        if (event.type !== "DEPUTIZE_DJ") return
        emitToSocket("DEPUTIZE_DJ", event.userId)
      },
      setSettings: (_ctx, event) => {
        emitToSocket("SET_ROOM_SETTINGS", event.data)
      },
      clearPlaylist: () => {
        emitToSocket("CLEAR_PLAYLIST", {})
      },
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
