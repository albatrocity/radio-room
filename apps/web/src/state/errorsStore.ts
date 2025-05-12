import { create } from "zustand"
import xstate from "zustand-middleware-xstate"
import { errorHandlerMachine } from "../machines/errorHandlerMachine"

export const useErrorsStore = create(xstate(errorHandlerMachine))
