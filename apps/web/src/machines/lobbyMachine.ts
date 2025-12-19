/**
 * Lobby Machine
 *
 * Manages the lobby socket connection and room state for the public lobby.
 * Fetches initial room data from the API, then subscribes to real-time
 * updates via the lobby socket channel.
 */

import { assign, setup, fromPromise, fromCallback } from "xstate"
import { QueueItem } from "@repo/types"
import { findAllRooms, RoomsResponse } from "../lib/serverApi"
import { Room, RoomError } from "../types/Room"
import socket from "../lib/socket"

/**
 * Room data with additional live fields from the server
 */
export interface LobbyRoom extends Omit<Room, "password"> {
  userCount?: number
  creatorName?: string
  nowPlaying?: QueueItem | null
}

/**
 * Lobby room update from socket
 */
export interface LobbyRoomUpdate {
  roomId: string
  userCount?: number
  nowPlaying?: QueueItem | null
}

export interface LobbyContext {
  rooms: LobbyRoom[]
  error: RoomError | null
}

export type LobbyEvent =
  | { type: "CONNECT" }
  | { type: "DISCONNECT" }
  | { type: "ROOM_UPDATED"; data: LobbyRoomUpdate }
  | { type: "ROOMS_LOADED"; data: { rooms: LobbyRoom[] } }
  | { type: "FETCH_ERROR"; error: RoomError }
  | { type: "SOCKET_CONNECTED" }
  | { type: "SOCKET_DISCONNECTED" }
  | { type: "REFETCH" }

/**
 * Fetch all rooms from the API
 */
const fetchRoomsLogic = fromPromise<RoomsResponse, void>(async () => {
  const results = await findAllRooms()
  return results
})

/**
 * Socket subscription callback
 * Joins the lobby channel and listens for room updates
 */
const socketSubscriptionLogic = fromCallback<LobbyEvent>(({ sendBack }) => {
  const handleConnect = () => {
    socket.emit("JOIN_LOBBY")
    sendBack({ type: "SOCKET_CONNECTED" })
  }

  const handleDisconnect = () => {
    sendBack({ type: "SOCKET_DISCONNECTED" })
  }

  const handleRoomUpdate = (update: LobbyRoomUpdate) => {
    sendBack({ type: "ROOM_UPDATED", data: update })
  }

  // If already connected, join immediately
  if (socket.connected) {
    socket.emit("JOIN_LOBBY")
  }

  // Listen for connection events
  socket.on("connect", handleConnect)
  socket.on("disconnect", handleDisconnect)
  socket.on("LOBBY_ROOM_UPDATE", handleRoomUpdate)

  // Cleanup on unsubscribe
  return () => {
    socket.emit("LEAVE_LOBBY")
    socket.off("connect", handleConnect)
    socket.off("disconnect", handleDisconnect)
    socket.off("LOBBY_ROOM_UPDATE", handleRoomUpdate)
  }
})

export const lobbyMachine = setup({
  types: {
    context: {} as LobbyContext,
    events: {} as LobbyEvent,
  },
  actors: {
    fetchRooms: fetchRoomsLogic,
    socketSubscription: socketSubscriptionLogic,
  },
  actions: {
    setRooms: assign(({ event }) => {
      if (event.type !== "ROOMS_LOADED") return {}
      return {
        rooms: event.data.rooms,
        error: null,
      }
    }),
    setError: assign(({ event }) => {
      if (event.type !== "FETCH_ERROR") return {}
      return {
        error: event.error,
      }
    }),
    updateRoom: assign(({ context, event }) => {
      if (event.type !== "ROOM_UPDATED") return context
      const { roomId, ...updates } = event.data
      return {
        rooms: context.rooms.map((room) => (room.id === roomId ? { ...room, ...updates } : room)),
      }
    }),
  },
}).createMachine({
  id: "lobby",
  initial: "idle",
  context: {
    rooms: [],
    error: null,
  },
  states: {
    idle: {
      on: {
        CONNECT: "connecting",
      },
    },
    connecting: {
      invoke: {
        id: "socketSubscription",
        src: "socketSubscription",
      },
      entry: "fetchRoomsOnConnect",
      always: "connected",
    },
    connected: {
      invoke: {
        id: "socketSubscription",
        src: "socketSubscription",
      },
      initial: "loading",
      on: {
        DISCONNECT: "disconnecting",
        ROOM_UPDATED: {
          actions: "updateRoom",
        },
        REFETCH: ".loading",
      },
      states: {
        loading: {
          invoke: {
            id: "fetchRooms",
            src: "fetchRooms",
            onDone: {
              target: "ready",
              actions: assign({
                rooms: ({ event }) => event.output.rooms as LobbyRoom[],
                error: null,
              }),
            },
            onError: {
              target: "error",
              actions: assign({
                error: ({ event }) => event.error as RoomError,
              }),
            },
          },
        },
        ready: {},
        error: {
          on: {
            REFETCH: "loading",
          },
        },
      },
    },
    disconnecting: {
      always: "idle",
    },
  },
})
