// State machine for fetching all public rooms (no auth required)

import { assign, setup, fromPromise } from "xstate"
import { findAllRooms, RoomsResponse } from "../lib/serverApi"
import { Room, RoomError } from "../types/Room"

export interface AllRoomsFetchContext {
  rooms: Omit<Room, "password">[]
  error: RoomError | null
}

export type AllRoomsFetchEvent =
  | { type: "xstate.done.actor.fetchAllRooms"; output: RoomsResponse }
  | { type: "xstate.error.actor.fetchAllRooms"; error: RoomError }
  | { type: "FETCH" }

const fetchAllRoomsLogic = fromPromise<RoomsResponse, void>(async () => {
  const results = await findAllRooms()
  return results
})

export const allRoomsFetchMachine = setup({
  types: {
    context: {} as AllRoomsFetchContext,
    events: {} as AllRoomsFetchEvent,
  },
  actors: {
    fetchAllRooms: fetchAllRoomsLogic,
  },
  actions: {
    setError: assign(({ context, event }) => {
      if (event.type !== "xstate.error.actor.fetchAllRooms") return context
      return {
        error: event.error,
      }
    }),
    setRooms: assign(({ context, event }) => {
      if (event.type !== "xstate.done.actor.fetchAllRooms") {
        return context
      }
      return {
        rooms: event.output.rooms,
      }
    }),
  },
}).createMachine({
  id: "allRoomsFetch",
  initial: "initial",
  context: {
    rooms: [],
    error: null,
  },
  on: {
    FETCH: {
      target: ".loading",
    },
  },
  states: {
    initial: {},
    loading: {
      invoke: {
        id: "fetchAllRooms",
        src: "fetchAllRooms",
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
    success: {},
    error: {},
  },
})
