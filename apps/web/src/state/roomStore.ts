import { create } from "zustand"
import xstate from "zustand-middleware-xstate"
import { roomFetchMachine } from "../machines/roomFetchMachine"
import { useAuthStore } from "./authStore"
import { toast } from "../lib/toasts"

export const useRoomStore = create(
  xstate(
    roomFetchMachine.withConfig({
      actions: {
        onError: (ctx) => {
          toast({
            title: "Something went wrong",
            description:
              ctx.error?.message ??
              "An error occured trying to access that room.",
            status: "error",
          })
          window.location.href = "/"
        },
        onSuccess: (ctx) => {
          if (!ctx.room) {
            toast({
              title: "Room not found",
              description: "The room you are looking for does not exist",
              status: "error",
            })
            window.location.href = "/"
          } else {
            const authState = useAuthStore.getState()
            authState.send("SET_PASSWORD_REQUIREMENT", {
              passwordRequired: ctx.room.passwordRequired,
            })
            useAuthStore
              .getState()
              .send("SETUP", { data: { roomId: ctx.room.id } })
          }
        },
      },
    }),
  ),
)

export const useCurrentRoom = () => {
  return useRoomStore((s) => s.state.context.room)
}

export const useCurrentRoomHasAudio = () => {
  return useRoomStore((s) => s.state.context.room?.type === "radio")
}

export const useRoomBanner = () => {
  return useRoomStore((s) => s.state.context.room?.extraInfo)
}

export const useRoomError = () => {
  return useRoomStore((s) => s.state.context.error)
}

export const useRoomCreator = () => {
  return useRoomStore((s) => s.state.context.room?.creator)
}
