// state machine for fetching saved tracks

import { assign, createMachine } from "xstate"
import { saveCurrentUser } from "../lib/getCurrentUser"
import { createRoom as apiCreateRoom, RoomCreationResponse } from "../lib/serverApi"
import { RoomSetup } from "../types/Room"

interface RoomSetupContext {
  userId: string | null
  challenge: string | null
  error: string | null
  room: RoomSetup | null
}

async function createRoom(ctx: RoomSetupContext) {
  const roomType = ctx.room?.type ?? "jukebox"

  // Set adapter IDs based on room type
  // For jukebox rooms, use Spotify for both playback and metadata
  // For radio rooms, use Shoutcast for media source
  const playbackControllerId = roomType === "jukebox" ? "spotify" : undefined
  const metadataSourceId = roomType === "jukebox" ? "spotify" : undefined
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
      metadataSourceId,
      mediaSourceId,
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
      data: Pick<RoomSetupContext, "challenge" | "userId"> & { room: RoomSetup }
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
        // Clear the creation flag on error so user can retry
        sessionStorage.removeItem("roomCreationInProgress")
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
            userId: event.data.room?.creator ?? ctx.userId ?? "",
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
        window.location.href = `/rooms/${event.data.room.id}`
      },
      setRequirements: assign((ctx, event) => {
        if (event.type !== "SET_REQUIREMENTS") return ctx
        return {
          userId: event.data.userId,
          challenge: event.data.challenge,
          room: event.data.room,
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
