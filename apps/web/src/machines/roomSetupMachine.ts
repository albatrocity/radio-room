// state machine for room setup/creation

import { assign, setup, fromPromise } from "xstate"
import { saveCurrentUser } from "../lib/getCurrentUser"
import { createRoom as apiCreateRoom, RoomCreationResponse } from "../lib/serverApi"
import { RoomSetup } from "../types/Room"

interface RoomSetupContext {
  userId: string | null
  challenge: string | null
  error: string | null
  room: RoomSetup | null
}

type RoomSetupEvent =
  | {
      type: "xstate.done.actor.createRoomRequest"
      output: RoomCreationResponse
    }
  | {
      type: "xstate.error.actor.createRoomRequest"
      error: unknown
    }
  | {
      type: "SET_REQUIREMENTS"
      data: Pick<RoomSetupContext, "challenge" | "userId"> & { room: RoomSetup }
    }

const createRoomLogic = fromPromise<RoomCreationResponse, RoomSetupContext>(
  async ({ input: ctx }) => {
    const roomType = ctx.room?.type ?? "jukebox"

    // Set adapter IDs based on room type
    // For jukebox rooms, use Spotify for both playback and metadata
    // For radio rooms, use Shoutcast for media source
    const playbackControllerId = roomType === "jukebox" ? "spotify" : undefined
    const metadataSourceIds = roomType === "jukebox" ? ["spotify"] : undefined
    const mediaSourceId = roomType === "radio" ? "shoutcast" : undefined

    const res = await apiCreateRoom({
      room: {
        type: roomType,
        title: ctx.room?.title ?? "My Room",
        radioListenUrl: ctx.room?.radioListenUrl ?? undefined,
        radioMetaUrl: ctx.room?.radioMetaUrl ?? undefined,
        radioProtocol: ctx.room?.radioProtocol ?? undefined,
        deputizeOnJoin: ctx.room?.deputizeOnJoin ?? false,
        playbackControllerId,
        metadataSourceIds,
        mediaSourceId,
      },
      challenge: ctx.challenge ?? "",
      userId: ctx.userId ?? "",
    })
    return res
  },
)

export const roomSetupMachine = setup({
  types: {
    context: {} as RoomSetupContext,
    events: {} as RoomSetupEvent,
  },
  actors: {
    createRoomRequest: createRoomLogic,
  },
  actions: {
    setError: assign(({ context, event }) => {
      if (event.type !== "xstate.error.actor.createRoomRequest") return {}
      // Clear the creation flag on error so user can retry
      sessionStorage.removeItem("roomCreationInProgress")
      return {
        error: String(event.error),
      }
    }),
    setRoom: ({ context, event }) => {
      if (event.type !== "xstate.done.actor.createRoomRequest") {
        return
      }
      saveCurrentUser({
        currentUser: {
          userId: event.output.room?.creator ?? context.userId ?? "",
          isAdmin: true,
        },
      })
      // Clear all room creation state from sessionStorage
      sessionStorage.removeItem("createRoomTitle")
      sessionStorage.removeItem("createRoomType")
      sessionStorage.removeItem("createRoomDeputizeOnJoin")
      sessionStorage.removeItem("createRoomradioMetaUrl")
      sessionStorage.removeItem("createRoomRadioListenUrl")
      sessionStorage.removeItem("createRoomRadioProtocol")
      sessionStorage.removeItem("roomCreationInProgress")
      window.location.href = `/rooms/${event.output.room.id}`
    },
    setRequirements: assign(({ event }) => {
      if (event.type !== "SET_REQUIREMENTS") return {}
      return {
        userId: event.data.userId,
        challenge: event.data.challenge,
        room: event.data.room,
      }
    }),
  },
  guards: {
    hasRequirements: ({ context }) => {
      return !!context.challenge && !!context.userId
    },
  },
}).createMachine({
  id: "roomSetup",
  initial: "initial",
  context: {
    userId: null,
    challenge: null,
    error: null,
    room: null,
  },
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
        src: "createRoomRequest",
        input: ({ context }) => context,
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
})

export type { RoomSetupEvent }
