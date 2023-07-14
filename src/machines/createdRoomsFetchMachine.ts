// state machine for fetching saved tracks

import { assign, createMachine } from "xstate"
import {
  findUserCreatedRooms,
  RoomFindResponse,
  RoomsResponse,
} from "../lib/serverApi"
import { Room, RoomError } from "../types/Room"
import { User } from "../types/User"

export interface RoomFetchContext {
  userId?: User["userId"]
  rooms: Omit<Room, "password">[]
  error: RoomError | null
}

async function fetchUserRooms(
  ctx: RoomFetchContext,
): Promise<RoomFindResponse> {
  if (ctx.userId) {
    const results = await findUserCreatedRooms(ctx.userId)
    return results
  }
  throw new Error("No userId provided")
}

export type RoomFetchEvent =
  | {
      type: "done.invoke.fetchUserRooms"
      data: RoomsResponse
      error?: null
    }
  | {
      type: "error.invoke.fetchUserRooms"
      data: RoomsResponse
      error: RoomError
    }
  | { type: "FETCH"; data: { userId: User["userId"] }; error?: string }

export const createdRoomsFetchMachine = createMachine<
  RoomFetchContext,
  RoomFetchEvent
>(
  {
    id: "createdRoomsFetch",
    predictableActionArguments: true,
    initial: "initial",
    context: {
      userId: undefined,
      rooms: [],
      error: null,
    },
    states: {
      initial: {
        on: {
          FETCH: {
            target: "loading",
            actions: ["setId"],
          },
        },
      },
      loading: {
        invoke: {
          id: "fetchUserRooms",
          src: fetchUserRooms,
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
      success: {
        entry: ["onSuccess"],
      },
      error: {
        entry: ["onError"],
      },
    },
  },
  {
    actions: {
      setError: assign((ctx, event) => {
        if (event.type !== "error.invoke.fetchUserRooms") return ctx
        return {
          error: event.error,
        }
      }),
      setUserId: assign((ctx, event) => {
        if (event.type !== "FETCH") return ctx
        return {
          userId: event.data.userId,
        }
      }),
      setRooms: assign((ctx, event) => {
        if (event.type !== "done.invoke.fetchUserRooms") {
          return ctx
        }
        return {
          rooms: event.data.rooms,
        }
      }),
    },
  },
)
