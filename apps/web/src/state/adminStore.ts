import { create } from "zustand"
import xstate from "zustand-middleware-xstate"
import { adminMachine } from "../machines/adminMachine"

export const useAdminStore = create(xstate(adminMachine))
