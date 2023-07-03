import { create } from "zustand"
import xstate from "zustand-middleware-xstate"
import { globalSettingsMachine } from "../machines/globalSettingsMachine"

export const useGlobalSettingsStore = create(xstate(globalSettingsMachine))
export const useGlobalSettings = () =>
  useGlobalSettingsStore((s) => s.state.context)
export const useBanner = () =>
  useGlobalSettingsStore((s) => s.state.context.banner)

export function fetchSettings() {
  return useGlobalSettingsStore.getState().send("FETCH")
}
