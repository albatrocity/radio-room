// state machine for fetching saved tracks

import { assign, setup, fromPromise } from "xstate"
import {
  findUserCreatedRooms,
  RoomsResponse,
  deleteRoom as deleteRoomData,
} from "../lib/serverApi"
import { toast } from "../lib/toasts"
import { Room, RoomError } from "../types/Room"
import { User } from "../types/User"

export interface RoomFetchContext {
  userId?: User["userId"]
  rooms: Omit<Room, "password">[]
  error: RoomError | null
}

export type RoomFetchEvent =
  | { type: "xstate.done.actor.fetchUserRooms"; output: RoomsResponse }
  | { type: "xstate.error.actor.fetchUserRooms"; error: RoomError }
  | { type: "xstate.done.actor.deleteRoom"; output: void }
  | { type: "xstate.error.actor.deleteRoom"; error: RoomError }
  | { type: "FETCH"; data: { userId: User["userId"] } }
  | { type: "DELETE_ROOM"; data: { roomId: string } }
  | { type: "SESSION_ENDED" }

const fetchUserRoomsLogic = fromPromise<RoomsResponse, { userId?: string }>(async ({ input }) => {
  if (input.userId) {
    const results = await findUserCreatedRooms()
    return results
  }
  throw new Error("No userId provided")
})

const deleteRoomLogic = fromPromise<void, { roomId: string }>(async ({ input }) => {
  await deleteRoomData(input.roomId)
})

export const createdRoomsFetchMachine = setup({
  types: {
    context: {} as RoomFetchContext,
    events: {} as RoomFetchEvent,
  },
  actors: {
    fetchUserRooms: fetchUserRoomsLogic,
    deleteRoom: deleteRoomLogic,
  },
  actions: {
    setError: assign(({ context, event }) => {
      if (event.type !== "xstate.error.actor.fetchUserRooms") return context
      return {
        error: event.error,
      }
    }),
    setUserId: assign(({ context, event }) => {
      if (event.type !== "FETCH") return context
      return {
        userId: event.data.userId,
      }
    }),
    setRooms: assign(({ context, event }) => {
      if (event.type !== "xstate.done.actor.fetchUserRooms") {
        return context
      }
      return {
        rooms: event.output.rooms,
      }
    }),
    reset: assign(() => {
      return {
        userId: undefined,
        rooms: [],
        error: null,
      }
    }),
    notifyRoomDeleted: () => {
      toast({
        title: "Room deleted",
        description: "Your room has been deleted",
        status: "success",
      })
    },
  },
}).createMachine({
  id: "createdRoomsFetch",
  initial: "initial",
  context: {
    userId: undefined,
    rooms: [],
    error: null,
  },
  on: {
    FETCH: {
      target: ".loading",
      actions: ["setUserId"],
    },
    SESSION_ENDED: {
      target: ".initial",
      actions: ["reset"],
    },
  },
  states: {
    initial: {},
    loading: {
      invoke: {
        id: "fetchUserRooms",
        src: "fetchUserRooms",
        input: ({ context }) => ({ userId: context.userId }),
        onDone: {
          target: "success",
          actions: ["setRooms"],
        },
        onError: {
          target: "error",
          actions: ["setError"],
        },
      },
    },
    deleting: {
      invoke: {
        id: "deleteRoom",
        src: "deleteRoom",
        input: ({ event }) => {
          if (event.type === "DELETE_ROOM") {
            return { roomId: event.data.roomId }
          }
          return { roomId: "" }
        },
        onDone: {
          target: "loading",
          actions: ["notifyRoomDeleted"],
        },
        onError: {
          target: "error",
          actions: ["setError"],
        },
      },
    },
    success: {
      on: {
        DELETE_ROOM: {
          target: "deleting",
        },
      },
    },
    error: {},
  },
})
