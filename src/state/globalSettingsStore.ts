import { create } from "zustand"
import xstate from "zustand-middleware-xstate"
import { globalSettingsMachine } from "../machines/globalSettingsMachine"

export const useGlobalSettingsStore = create(xstate(globalSettingsMachine))
export const useBanner = () =>
  useGlobalSettingsStore((s) => s.state.context.banner)
