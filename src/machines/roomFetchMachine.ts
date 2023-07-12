// state machine for fetching saved tracks

import { assign, createMachine } from "xstate"
import { findRoom, RoomFindResponse } from "../lib/serverApi"
import { Room } from "../types/Room"

export interface RoomFetchContext {
  fetchOnInit: boolean
  id: Room["id"] | null
  room: Room | null
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
  | { type: "FETCH"; data: { id: Room["id"] }; error?: string }

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
        if (event.type === "done.invoke.fetchRoom") return ctx
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
        if (event.type !== "done.invoke.fetchRoom") return ctx
        return {
          room: event.data.room,
        }
      }),
    },
  },
)