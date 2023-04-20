import { create } from "zustand"
import xstate from "zustand-middleware-xstate"
import { djMachine } from "../machines/djMachine"

export const useDjStore = create(xstate(djMachine))
