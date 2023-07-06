import { navigate } from "gatsby"
import { create } from "zustand"
import xstate from "zustand-middleware-xstate"
import { roomFetchMachine } from "../machines/roomFetchMachine"
import { useAuthStore } from "./authStore"

export const useRoomStore = create(
  xstate(
    roomFetchMachine.withConfig({
      actions: {
        onError: (ctx) => {
          navigate("/", {
            state: {
              toast: {
                title: "Oops!",
                description:
                  ctx.error ?? "An error occured trying to access that room.",
                status: "error",
              },
            },
          })
        },
        onSuccess: (ctx) => {
          if (!ctx.room) {
            navigate("/", {
              state: {
                toast: {
                  title: "Room not found",
                  description: "The room you are looking for does not exist",
                  status: "error",
                },
              },
            })
          } else {
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
