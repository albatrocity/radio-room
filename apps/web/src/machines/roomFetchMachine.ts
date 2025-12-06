// state machine for fetching room data

import { HTTPError } from "ky"
import { assign, setup, fromCallback, fromPromise } from "xstate"

import socket from "../lib/socket"
import { getErrorMessage } from "../lib/errors"
import { findRoom, RoomFindResponse } from "../lib/serverApi"
import { emitToSocket, subscribeById, unsubscribeById } from "../actors/socketActor"
import { chatActor } from "../actors/chatActor"
import { playlistActor } from "../actors/playlistActor"
import { Room, RoomError } from "../types/Room"

// ============================================================================
// Types
// ============================================================================

export interface RoomFetchContext {
  fetchOnInit: boolean
  id: Room["id"] | null
  room: Omit<Room, "password"> | null
  error?: RoomError | null
  subscriptionId: string | null
}

export type RoomFetchEvent =
  | { type: "ACTIVATE" }
  | { type: "DEACTIVATE" }
  | {
      type: "xstate.done.actor.fetchRoom"
      output: RoomFindResponse
    }
  | {
      type: "xstate.error.actor.fetchRoom"
      error: HTTPError
    }
  | { type: "FETCH"; data: { id: Room["id"] } }
  | { type: "SOCKET_ERROR"; data: { error?: RoomError } }
  | { type: "RESET" }
  | { type: "SETTINGS"; data: Room }
  | { type: "ROOM_SETTINGS_UPDATED"; data: { roomId: string; room: Omit<Room, "password"> } }
  | { type: "GET_LATEST_ROOM_DATA" }
  | { type: "ROOM_DELETED" }
  | { type: "RECONNECTED" }
  | { type: "SESSION_ENDED" }

// ============================================================================
// Actors
// ============================================================================

// Socket.io connection event listener (for reconnect/disconnect)
const socketConnectionLogic = fromCallback<RoomFetchEvent>(({ sendBack }) => {
  const handleReconnect = () => {
    console.log("[RoomFetch] Socket reconnected, will refetch room data")
    sendBack({ type: "RECONNECTED" } as RoomFetchEvent)
  }

  const handleDisconnect = (reason: string) => {
    console.log("[RoomFetch] Socket disconnected:", reason)
    sendBack({
      type: "SOCKET_ERROR",
      data: {
        error: {
          message: "Connection lost",
        },
      },
    } as RoomFetchEvent)
  }

  socket.io.on("reconnect", handleReconnect)
  socket.on("disconnect", handleDisconnect)

  return () => {
    socket.io.off("reconnect", handleReconnect)
    socket.off("disconnect", handleDisconnect)
  }
})

// Fetch room promise actor
const fetchRoomLogic = fromPromise<RoomFindResponse, { id: Room["id"] | null }>(
  async ({ input }) => {
    if (input.id) {
      const results = await findRoom(input.id)
      return results
    }
    throw new Error("No room id provided")
  },
)

// ============================================================================
// Machine
// ============================================================================

let subscriptionCounter = 0

export const roomFetchMachine = setup({
  types: {
    context: {} as RoomFetchContext,
    events: {} as RoomFetchEvent,
  },
  actors: {
    socketConnection: socketConnectionLogic,
    fetchRoom: fetchRoomLogic,
  },
  actions: {
    subscribe: assign(({ self }) => {
      const id = `room-${self.id}-${++subscriptionCounter}`
      subscribeById(id, { send: (event) => self.send(event as RoomFetchEvent) })
      return { subscriptionId: id }
    }),
    unsubscribe: ({ context }) => {
      if (context.subscriptionId) {
        unsubscribeById(context.subscriptionId)
      }
    },
    setSocketError: assign(({ context, event }) => {
      if (event.type !== "SOCKET_ERROR") return context
      return {
        error: {
          message: "You've been disconnected from the server, attempting to reconnect...",
          status: 400,
        },
      }
    }),
    clearError: assign(() => {
      return {
        error: null,
      }
    }),
    setError: assign(({ context, event }) => {
      if (event.type !== "xstate.error.actor.fetchRoom" && event.type !== "SOCKET_ERROR") {
        return context
      }

      const errorStatus =
        event.type === "xstate.error.actor.fetchRoom"
          ? (event.error as any)?.response?.status
          : (event as any).data?.error?.status
      const errorMessage = getErrorMessage({ status: errorStatus }, false, "room")

      return {
        error: {
          message: errorMessage,
          status: errorStatus ?? 500,
        },
      }
    }),
    setId: assign(({ context, event }) => {
      if (event.type !== "FETCH") return context
      return {
        id: event.data.id,
      }
    }),
    setRoom: assign(({ context, event }) => {
      if (event.type === "xstate.done.actor.fetchRoom") {
        return {
          room: event.output.room,
        }
      }
      if (event.type === "ROOM_SETTINGS_UPDATED") {
        return {
          room: event.data.room,
        }
      }
      return context
    }),
    reset: assign(() => {
      return {
        id: null,
        room: null,
        error: null,
        subscriptionId: null,
      }
    }),
    getLatestData: ({ context }) => {
      const messages = chatActor.getSnapshot().context.messages
      const lastMessageTime = messages[messages.length - 1]?.timestamp
      const playlist = playlistActor.getSnapshot().context.playlist
      const lastPlaylistItemTime = playlist[playlist.length - 1]?.addedAt

      emitToSocket("GET_LATEST_ROOM_DATA", {
        id: context.id,
        lastMessageTime,
        lastPlaylistItemTime,
      })
    },
    assignRoomDeleted: assign(() => {
      return {
        error: {
          message: "This room has expired and its data has been permanently deleted.",
          status: 404,
        },
      }
    }),
  },
}).createMachine({
  id: "roomFetch",
  initial: "idle",
  context: {
    fetchOnInit: true,
    id: null,
    room: null,
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
      invoke: {
        id: "socketConnection",
        src: "socketConnection",
      },
      on: {
        DEACTIVATE: {
          target: "idle",
          actions: ["reset"],
        },
        FETCH: {
          target: ".loading",
          actions: ["setId"],
        },
        RESET: {
          actions: ["reset"],
          target: ".initial",
        },
        ROOM_DELETED: {
          actions: ["assignRoomDeleted"],
        },
        SOCKET_ERROR: {
          actions: ["setSocketError"],
        },
        RECONNECTED: {
          actions: ["getLatestData", "clearError"],
        },
        SESSION_ENDED: {
          actions: ["reset"],
          target: ".initial",
        },
      },
      initial: "initial",
      states: {
        initial: {},
        loading: {
          invoke: {
            id: "fetchRoom",
            src: "fetchRoom",
            input: ({ context }) => ({ id: context.id }),
            onDone: {
              target: "success",
              actions: ["setRoom"],
            },
            onError: {
              target: "error",
              actions: ["setError"],
            },
          },
        },
        success: {
          on: {
            ROOM_SETTINGS_UPDATED: {
              actions: ["setRoom"],
            },
            GET_LATEST_ROOM_DATA: {
              actions: ["getLatestData"],
            },
          },
        },
        error: {},
      },
    },
  },
})
