import { create } from "zustand"
import xstate from "zustand-middleware-xstate"
import { authMachine } from "../machines/authMachine"

export const useAuthStore = create(xstate(authMachine))

export const useCurrentUser = () => {
  return useAuthStore((s) => s.state.context.currentUser)
}
