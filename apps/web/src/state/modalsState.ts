import { create } from "zustand"
import xstate from "zustand-middleware-xstate"
import { modalsMachine } from "../machines/modalsMachine"

export const useModalsStore = create(xstate(modalsMachine))
