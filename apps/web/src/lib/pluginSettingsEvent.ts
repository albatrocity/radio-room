import type { Event as ModalsEvent } from "../machines/modalsMachine"

/** `modalsMachine` event that opens a plugin's settings form (`settings.plugin`). */
export function toPluginSettingsEvent(pluginName: string): ModalsEvent {
  return { type: "EDIT_PLUGIN_SETTINGS", pluginName }
}
