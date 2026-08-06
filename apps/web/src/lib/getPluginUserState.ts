/**
 * Read a plugin's bag from `USER_GAME_STATE.pluginUserState`.
 * Pure helper so it can be unit-tested without React/jsdom.
 */
export function getPluginUserState<T extends Record<string, unknown>>(
  pluginUserState: Record<string, Record<string, unknown>> | null | undefined,
  pluginName: string,
): T | null {
  if (!pluginUserState) return null
  const bag = pluginUserState[pluginName]
  if (!bag || typeof bag !== "object") return null
  return bag as T
}
