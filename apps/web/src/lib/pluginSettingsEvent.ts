/**
 * Convert plugin name to modalsMachine event for that plugin's settings page.
 * e.g. "playlist-democracy" -> "EDIT_PLAYLIST_DEMOCRACY", "the-fed" -> "EDIT_THE_FED".
 *
 * The event is a no-op until `modalsMachine` declares it and a `settings.{name}`
 * child state (hyphens → underscores). Add that every time you create a plugin.
 */
export function toPluginSettingsEventType(pluginName: string): string {
  return `EDIT_${pluginName.replace(/-/g, "_").toUpperCase()}`
}
