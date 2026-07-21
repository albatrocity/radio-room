/**
 * Convert plugin name to modalsMachine event for that plugin's settings page.
 * e.g. "playlist-democracy" -> "EDIT_PLAYLIST_DEMOCRACY"
 */
export function toPluginSettingsEventType(pluginName: string): string {
  return `EDIT_${pluginName.replace(/-/g, "_").toUpperCase()}`
}
