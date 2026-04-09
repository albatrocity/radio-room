// state machine for fetching room data

import { HTTPError } from "ky"
import { assign, setup, fromCallback, fromPromise } from "xstate"
import type { RoomScheduleSnapshotDTO } from "@repo/types"

import socket from "../lib/socket"
import { getErrorMessage } from "../lib/errors"
import { findRoom, RoomFindResponse } from "../lib/serverApi"
import { emitToSocket, subscribeById, unsubscribeById } from "../actors/socketActor"
import { audioActor } from "../actors/audioActor"
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
  scheduleSnapshot: RoomScheduleSnapshotDTO | null
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
  | {
      type: "SHOW_SCHEDULE_UPDATED"
      data: {
        roomId: string
        showId: string | null
        snapshot: RoomScheduleSnapshotDTO | null
      }
    }
  | { type: "GET_LATEST_ROOM_DATA" }
  | {
      type: "ROOM_DATA"
      data: {
        room: Omit<Room, "password">
        messages: unknown[]
        playlist: unknown[]
        scheduleSnapshot?: RoomScheduleSnapshotDTO | null
      }
    }
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
    /**
     * Hybrid radio WebRTC must stop before room context updates reach React, or Shoutcast
     * mounts with a stale "playing" snapshot from the audio machine (play then does nothing).
     */
    stopAudioWhenHybridRadioIngestDisabled: ({ context, event }) => {
      if (event.type !== "ROOM_SETTINGS_UPDATED" && event.type !== "ROOM_DATA") {
        return
      }
      const prev = context.room
      const next = event.data.room
      if (!prev || !next) return
      if (prev.type !== "radio" || next.type !== "radio") return
      if (!prev.liveIngestEnabled) return
      // Still enabled (explicit true); false/undefined = path off
      if (next.liveIngestEnabled === true) return
      audioActor.send({ type: "STOP" })
    },
    setRoom: assign(({ context, event }) => {
      const hasShow = (r: Omit<Room, "password"> | null | undefined) =>
        r?.showId != null && r.showId !== ""

      if (event.type === "xstate.done.actor.fetchRoom") {
        const r = event.output.room
        return {
          room: r,
          scheduleSnapshot: hasShow(r) ? (event.output.scheduleSnapshot ?? null) : null,
        }
      }
      if (event.type === "ROOM_SETTINGS_UPDATED") {
        const r = event.data.room
        return {
          room: r,
          scheduleSnapshot: hasShow(r) ? context.scheduleSnapshot : null,
        }
      }
      if (event.type === "ROOM_DATA") {
        const r = event.data.room
        const snap =
          event.data.scheduleSnapshot !== undefined
            ? event.data.scheduleSnapshot
            : context.scheduleSnapshot
        return {
          room: r,
          scheduleSnapshot: hasShow(r) ? snap : null,
        }
      }
      return context
    }),
    setScheduleFromSocket: assign(({ context, event }) => {
      if (event.type !== "SHOW_SCHEDULE_UPDATED") return context
      if (event.data.roomId !== context.id) return context
      return {
        ...context,
        scheduleSnapshot: event.data.snapshot,
      }
    }),
    reset: assign(() => {
      return {
        id: null,
        room: null,
        scheduleSnapshot: null,
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
    scheduleSnapshot: null,
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
        SHOW_SCHEDULE_UPDATED: {
          actions: ["setScheduleFromSocket"],
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
              actions: ["stopAudioWhenHybridRadioIngestDisabled", "setRoom"],
            },
            GET_LATEST_ROOM_DATA: {
              actions: ["getLatestData"],
            },
            ROOM_DATA: {
              actions: ["stopAudioWhenHybridRadioIngestDisabled", "setRoom"],
            },
          },
        },
        error: {},
      },
    },
  },
})
