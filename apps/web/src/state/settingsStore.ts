import { create } from "zustand"
// @ts-expect-error - zustand-middleware-xstate has package.json exports issue
import xstate from "zustand-middleware-xstate"
import { settingsMachine } from "../machines/settingsMachine"
import { State, EventObject } from "xstate"

interface SettingsContext {
  title: string
  fetchMeta: boolean
  extraInfo: string
  password: string
  artwork?: string
  deputizeOnJoin: boolean
  enableSpotifyLogin: boolean
  type: string
  radioMetaUrl: string
  radioListenUrl: string
  radioProtocol?: string
  announceUsernameChanges: boolean
  announceNowPlaying: boolean
  pluginConfigs: Record<string, Record<string, unknown>>
}

export interface SettingsStore {
  state: State<SettingsContext, EventObject>
  send: (event: EventObject | string) => void
}

/**
 * Shared settings store - use this instead of useMachine(settingsMachine).
 * This ensures all components share the same machine state.
 */
export const useSettingsStore = create<SettingsStore>(xstate(settingsMachine) as any)

