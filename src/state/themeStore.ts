import { create } from "zustand"
import xstate from "zustand-middleware-xstate"
import { themeMachine } from "../machines/themeMachine"

export const useThemeStore = create(xstate(themeMachine))

export const useCurrentTheme = () => useThemeStore((s) => s.state.context.theme)
