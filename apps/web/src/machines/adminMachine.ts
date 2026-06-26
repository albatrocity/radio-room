import { setup, assign, fromPromise } from "xstate"

import { toast } from "../lib/toasts"
import { getIsAdmin, getCurrentUser } from "../actors/authActor"
import { getCurrentRoom } from "../actors/roomActor"
import { emitToSocket, subscribeById, unsubscribeById } from "../actors/socketActor"
import { deleteRoom as deleteRoomData } from "../lib/serverApi"

// ============================================================================
// Types
// ============================================================================

type DeleteRoomEvent = {
  type: "DELETE_ROOM"
  data: { id: string }
}

export type AdminEvent =
  | { type: "ACTIVATE" }
  | { type: "DEACTIVATE" }
  | {
      type: "SET_SETTINGS"
      data: any
    }
  | {
      type: "ACTIVATE_SEGMENT"
      data: {
        segmentId: string
        showSegmentId?: string
        presetMode: "merge" | "replace" | "skip"
      }
    }
  | {
      type: "INJECT_SEGMENT_TRACKS"
      data: { showSegmentId: string; placement: "top" | "bottom" }
    }
  | {
      type: "CLEAR_PLAYLIST"
    }
  | {
      type: "DEPUTIZE_DJ"
      userId: string
    }
  | {
      type: "DESIGNATE_ADMIN"
      userId: string
    }
  | {
      type: "TOGGLE_PERSONA"
      userId: string
      personaId: string
    }
  | DeleteRoomEvent

interface AdminContext {
  subscriptionId: string | null
}

// ============================================================================
// Actors
// ============================================================================

const deleteRoomLogic = fromPromise<void, { id: string }>(async ({ input }) => {
  await deleteRoomData(input.id)
})

// ============================================================================
// Machine
// ============================================================================

let subscriptionCounter = 0

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
    isRoomCreator: () => {
      const user = getCurrentUser()
      const room = getCurrentRoom()
      return !!user && !!room && user.userId === room.creator
    },
  },
  actions: {
    subscribe: assign(({ self }) => {
      const id = `admin-${self.id}-${++subscriptionCounter}`
      subscribeById(id, { send: (event) => self.send(event as AdminEvent) })
      return { subscriptionId: id }
    }),
    unsubscribe: ({ context }) => {
      if (context.subscriptionId) {
        unsubscribeById(context.subscriptionId)
      }
    },
    deputizeDj: ({ event }) => {
      if (event.type !== "DEPUTIZE_DJ") return
      emitToSocket("DEPUTIZE_DJ", event.userId)
    },
    designateAdmin: ({ event }) => {
      if (event.type !== "DESIGNATE_ADMIN") return
      emitToSocket("DESIGNATE_ADMIN", event.userId)
    },
    togglePersona: ({ event }) => {
      if (event.type !== "TOGGLE_PERSONA") return
      emitToSocket("TOGGLE_PERSONA", { userId: event.userId, personaId: event.personaId })
    },
    setSettings: ({ event }) => {
      if (event.type !== "SET_SETTINGS") return
      emitToSocket("SET_ROOM_SETTINGS", event.data)
    },
    activateSegment: ({ event }) => {
      if (event.type !== "ACTIVATE_SEGMENT") return
      emitToSocket("SET_ACTIVE_SEGMENT", event.data)
    },
    injectSegmentTracks: ({ event }) => {
      if (event.type !== "INJECT_SEGMENT_TRACKS") return
      emitToSocket("INJECT_SEGMENT_TRACKS", event.data)
    },
    clearPlaylist: () => {
      emitToSocket("CLEAR_PLAYLIST", {})
    },
    notify: () => {
      toast({
        title: "Settings updated",
        status: "success",
        duration: 3000,
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
    reset: assign({
      subscriptionId: () => null,
    }),
  },
}).createMachine({
  id: "admin",
  initial: "idle",
  context: {
    subscriptionId: null,
  },
  states: {
    // Idle state - not subscribed to socket events
    idle: {
      on: {
        ACTIVATE: "active",
      },
    },
    // Active state - subscribed to socket events
    active: {
      entry: ["subscribe"],
      exit: ["unsubscribe"],
      on: {
        DEACTIVATE: {
          target: "idle",
          actions: ["reset"],
        },
        SET_SETTINGS: { actions: ["setSettings", "notify"], guard: "isAdmin" },
        ACTIVATE_SEGMENT: { actions: ["activateSegment"], guard: "isAdmin" },
        INJECT_SEGMENT_TRACKS: { actions: ["injectSegmentTracks"], guard: "isAdmin" },
        CLEAR_PLAYLIST: { actions: ["clearPlaylist"], guard: "isAdmin" },
        DELETE_ROOM: { target: ".deleting", guard: "isRoomCreator" },
        DEPUTIZE_DJ: { actions: ["deputizeDj"], guard: "isAdmin" },
        DESIGNATE_ADMIN: { actions: ["designateAdmin"], guard: "isRoomCreator" },
        TOGGLE_PERSONA: { actions: ["togglePersona"], guard: "isAdmin" },
      },
      initial: "ready",
      states: {
        ready: {},
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
              target: "ready",
              actions: ["onDeleteSuccess"],
            },
            onError: {
              target: "ready",
              actions: ["onDeleteError"],
            },
          },
        },
      },
    },
  },
})
