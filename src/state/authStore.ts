import { create } from "zustand"
import xstate from "zustand-middleware-xstate"
import { authMachine } from "../machines/authMachine"

export const useAuthStore = create(xstate(authMachine))

export const useCurrentUser = () => {
  return useAuthStore((s) => s.state.context.currentUser)
}

export const useIsAdmin = () => useAuthStore((s) => s.state.context.isAdmin)

export const useIsAuthenticated = () => {
  return useAuthStore((s) => s.state.matches("authenticated"))
}

// For machines and non-react components
export function getCurrentUser() {
  return useAuthStore.getState().state.context.currentUser
}
