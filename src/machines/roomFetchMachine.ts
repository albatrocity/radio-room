// state machine for fetching saved tracks

import { HTTPError } from "ky"
import { assign, createMachine, sendTo } from "xstate"

import socket from "../lib/socket"
import { getErrorMessage } from "../lib/errors"
import { findRoom, RoomFindResponse } from "../lib/serverApi"
import socketService from "../lib/socketService"
import { useChatStore } from "../state/chatStore"
import { usePlaylistStore } from "../state/playlistStore"
import { Room, RoomError } from "../types/Room"
import { SocketCallback } from "../types/SocketCallback"

export interface RoomFetchContext {
  fetchOnInit: boolean
  id: Room["id"] | null
  room: Omit<Room, "password"> | null
  error?: RoomError | null
}

async function fetchRoom(ctx: RoomFetchContext): Promise<RoomFindResponse> {
  if (ctx.id) {
    const results = await findRoom(ctx.id)
    return results
  }
  throw new Error("No room id provided")
}

function socketEventService(callback: SocketCallback) {
  socket.io.on("reconnect", () => {
    callback({ type: "RECONNECTED", data: {} })
  })
  socket.io.on("error", (e) => {
    callback({
      type: "SOCKET_ERROR",
      data: {
        error: {
          message: e,
        },
      },
    })
  })
}

export type RoomFetchEvent =
  | {
      type: "done.invoke.fetchRoom"
      data: RoomFindResponse
      error?: null
    }
  | {
      type: "error.invoke.fetchRoom"
      data: null
      error?: RoomError
    }
  | {
      type: "error.platform.fetchRoom"
      data?: HTTPError
      error: null
    }
  | { type: "FETCH"; data: { id: Room["id"] }; error?: string }
  | { type: "SOCKET_ERROR"; data: { error?: RoomError } }
  | { type: "RESET" }
  | { type: "SETTINGS"; data: Room }
  | { type: "ROOM_SETTINGS"; data: { room: Omit<Room, "password"> } }
  | { type: "GET_LATEST_ROOM_DATA" }
  | { type: "ROOM_DELETED" }
  | { type: "RECONNECTED" }

export const roomFetchMachine = createMachine<RoomFetchContext, RoomFetchEvent>(
  {
    id: "roomFetch",
    predictableActionArguments: true,
    initial: "initial",
    context: {
      fetchOnInit: true,
      id: null,
      room: null,
    },
    invoke: [
      {
        id: "socket",
        src: () => socketService,
      },
      {
        id: "socketEventService",
        src: () => socketEventService,
      },
    ],
    on: {
      FETCH: {
        target: "loading",
        actions: ["setId"],
      },
      RESET: {
        actions: ["reset"],
        target: "initial",
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
    },
    states: {
      initial: {},
      loading: {
        invoke: {
          id: "fetchRoom",
          src: fetchRoom,
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
          ROOM_SETTINGS: {
            actions: ["setRoom"],
          },
          GET_LATEST_ROOM_DATA: {
            actions: ["getLatestData"],
          },
        },
      },
      error: {
        entry: ["onError"],
      },
    },
  },
  {
    actions: {
      setSocketError: assign((ctx, event) => {
        if (event.type !== "SOCKET_ERROR") return ctx
        return {
          error: {
            message:
              "You've been disconnected from the server, attempting to reconnect...",
            status: 400,
          },
        }
      }),
      clearError: assign((ctx) => {
        return {
          error: null,
        }
      }),
      setError: assign((ctx, event) => {
        if (
          event.type !== "error.invoke.fetchRoom" &&
          event.type !== "error.platform.fetchRoom" &&
          event.type !== "SOCKET_ERROR"
        ) {
          return ctx
        }

        const errorStatus = event.data?.response?.status ?? event.error?.status
        const errorMessage = getErrorMessage(
          { status: errorStatus },
          false,
          "room",
        )

        return {
          error: {
            message: errorMessage,
            status: errorStatus ?? 500,
          },
        }
      }),
      setId: assign((ctx, event) => {
        if (event.type !== "FETCH") return ctx
        return {
          id: event.data.id,
        }
      }),
      setRoom: assign((ctx, event) => {
        if (
          event.type !== "done.invoke.fetchRoom" &&
          event.type !== "ROOM_SETTINGS"
        ) {
          return ctx
        }
        return {
          room: event.data.room,
        }
      }),
      reset: assign(() => {
        return {
          id: null,
          room: null,
          error: null,
        }
      }),
      getLatestData: sendTo("socket", (ctx) => {
        const messages = useChatStore.getState().state.context.messages
        const lastMessageTime = messages[messages.length - 1]?.timestamp
        const playlist = usePlaylistStore.getState().state.context.playlist
        const lastPlaylistItemTime = playlist[playlist.length - 1]?.timestamp

        return {
          type: "get latest room data",
          data: {
            id: ctx.id,
            lastMessageTime,
            lastPlaylistItemTime,
          },
        }
      }),
      assignRoomDeleted: assign(() => {
        return {
          error: {
            message:
              "This room has expired and its data has been permanently deleted.",
            status: 404,
          },
        }
      }),
    },
  },
)
