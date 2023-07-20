// state machine for fetching saved tracks

import { assign, createMachine, sendTo } from "xstate"

import { findRoom, RoomFindResponse } from "../lib/serverApi"
import socketService from "../lib/socketService"
import { useChatStore } from "../state/chatStore"
import { usePlaylistStore } from "../state/playlistStore"
import { Room, RoomError } from "../types/Room"

export interface RoomFetchContext {
  fetchOnInit: boolean
  id: Room["id"] | null
  room: Omit<Room, "password"> | null
  error: string
}

async function fetchRoom(ctx: RoomFetchContext): Promise<RoomFindResponse> {
  if (ctx.id) {
    const results = await findRoom(ctx.id)
    return results
  }
  throw new Error("No room id provided")
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
  | { type: "FETCH"; data: { id: Room["id"] }; error?: string }
  | { type: "RESET" }
  | { type: "SETTINGS"; data: Room }
  | { type: "ROOM_SETTINGS"; data: { room: Omit<Room, "password"> } }
  | { type: "GET_LATEST_ROOM_DATA" }

export const roomFetchMachine = createMachine<RoomFetchContext, RoomFetchEvent>(
  {
    id: "roomFetch",
    predictableActionArguments: true,
    initial: "initial",
    context: {
      fetchOnInit: true,
      id: null,
      room: null,
      error: "",
    },
    invoke: [
      {
        id: "socket",
        src: () => socketService,
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
      setError: assign((ctx, event) => {
        if (event.type !== "error.invoke.fetchRoom") return ctx
        return {
          error: event.error,
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
          error: "",
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
    },
  },
)
