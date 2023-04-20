import { create } from "zustand"
import xstate from "zustand-middleware-xstate"
import { chatMachine } from "../machines/chatMachine"

export const useChatStore = create(xstate(chatMachine))
