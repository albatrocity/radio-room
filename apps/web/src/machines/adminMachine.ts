import { setup, fromPromise } from "xstate"

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
      type: "SET_SETTINGS"
      data: any
    }
  | {
      type: "CLEAR_PLAYLIST"
    }
  | {
      type: "DEPUTIZE_DJ"
      userId: string
    }
  | DeleteRoomEvent

interface AdminContext {}

const deleteRoomLogic = fromPromise<void, { id: string }>(async ({ input }) => {
  await deleteRoomData(input.id)
})

export const adminMachine = setup({
  types: {
    context: {} as AdminContext,
    events: {} as AdminEvent,
  },
  actors: {
    deleteRoom: deleteRoomLogic,
  },
  guards: {
    isAdmin: () => {
      return getIsAdmin()
    },
  },
  actions: {
    deputizeDj: ({ event }) => {
      if (event.type !== "DEPUTIZE_DJ") return
      emitToSocket("DEPUTIZE_DJ", event.userId)
    },
    setSettings: ({ event }) => {
      if (event.type !== "SET_SETTINGS") return
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
    onDeleteSuccess: () => {
      toast({
        title: "Room deleted",
        description: "Your room has been deleted",
        status: "success",
      })
      window.location.href = "/"
    },
    onDeleteError: () => {
      toast({
        title: "Error deleting room",
        description: "There was an error deleting your room",
        status: "error",
      })
    },
  },
}).createMachine({
  id: "admin",
  initial: "idle",
  context: {},
  on: {
    SET_SETTINGS: { actions: ["setSettings", "notify"], guard: "isAdmin" },
    CLEAR_PLAYLIST: { actions: ["clearPlaylist"], guard: "isAdmin" },
    DELETE_ROOM: { target: ".deleting", guard: "isAdmin" },
    DEPUTIZE_DJ: { actions: ["deputizeDj"], guard: "isAdmin" },
  },
  states: {
    idle: {},
    deleting: {
      invoke: {
        id: "deleteRoom",
        src: "deleteRoom",
        input: ({ event }) => {
          if (event.type === "DELETE_ROOM") {
            return { id: event.data.id }
          }
          return { id: "" }
        },
        onDone: {
          target: "idle",
          actions: ["onDeleteSuccess"],
        },
        onError: {
          target: "idle",
          actions: ["onDeleteError"],
        },
      },
    },
  },
})
