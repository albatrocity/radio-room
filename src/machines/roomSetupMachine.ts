// state machine for fetching saved tracks

import { navigate } from "gatsby"
import { assign, createMachine } from "xstate"
import { saveCurrentUser } from "../lib/getCurrentUser"
import {
  createRoom as apiCreateRoom,
  RoomCreationResponse,
} from "../lib/serverApi"
import { RoomSetupShared } from "../types/Room"

interface RoomSetupContext {
  userId: string | null
  challenge: string | null
  error: string | null
  room: RoomSetupShared | null
}

async function createRoom(ctx: RoomSetupContext) {
  const res = await apiCreateRoom({
    room: {
      type: ctx.room?.type ?? "jukebox",
      title: ctx.room?.title ?? "My Room",
    },
    challenge: ctx.challenge ?? "",
    userId: ctx.userId ?? "",
  })
  return res
}

export type RoomSetupEvent =
  | {
      type: "done.invoke.createRoomRequest"
      data: RoomCreationResponse
      error?: null
    }
  | { type: "SAVED_TRACKS_RESULTS_FAILURE"; data: {}; error?: string }
  | {
      type: "SET_REQUIREMENTS"
      data: Pick<RoomSetupContext, "challenge" | "userId">
    }

export const roomSetupMachine = createMachine<RoomSetupContext, RoomSetupEvent>(
  {
    id: "roomSetup",
    initial: "initial",
    states: {
      initial: {
        on: {
          SET_REQUIREMENTS: {
            actions: ["setRequirements"],
            target: "loading",
          },
        },
      },
      loading: {
        invoke: {
          id: "createRoomRequest",
          src: createRoom,
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
        type: "final",
      },
      error: {},
    },
  },
  {
    actions: {
      setError: assign((ctx, event) => {
        if (event.type !== "done.invoke.createRoomRequest") return ctx
        return {
          error: event.error,
        }
      }),
      setRoom: (ctx, event) => {
        if (event.type !== "done.invoke.createRoomRequest") {
          return
        }
        saveCurrentUser({
          currentUser: {
            userId: event.data.room.creator ?? ctx.userId ?? "",
            isAdmin: true,
          },
        })
        navigate(`/rooms/${event.data.room.id}`)
      },
      setRequirements: assign((ctx, event) => {
        if (event.type !== "SET_REQUIREMENTS") return ctx
        return {
          userId: event.data.userId,
          challenge: event.data.challenge,
        }
      }),
    },
    guards: {
      hasRequirements: (ctx) => {
        return !!ctx.challenge && !!ctx.userId
      },
    },
  },
)