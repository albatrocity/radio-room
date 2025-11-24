import { create } from "zustand"
import xstate from "zustand-middleware-xstate"
import { usersMachine } from "../machines/usersMachine"

export const useUsersStore = create(xstate(usersMachine))

export const useListeners = () =>
  useUsersStore((s) => s.state.context.listeners)

export const useUsers = () => useUsersStore((s) => s.state.context.users)
export const useDj = () => useUsersStore((s) => s.state.context.dj)
