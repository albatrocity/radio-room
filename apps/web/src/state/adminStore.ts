import { create } from "zustand"
// @ts-expect-error - zustand-middleware-xstate has package.json exports issue
import xstate from "zustand-middleware-xstate"
import { adminMachine } from "../machines/adminMachine"
import { State, EventObject } from "xstate"

export interface AdminStore {
  state: State<any, EventObject>
  send: (event: EventObject | string) => void
}

export const useAdminStore = create<AdminStore>(xstate(adminMachine) as any)
