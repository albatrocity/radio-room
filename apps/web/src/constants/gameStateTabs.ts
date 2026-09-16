export const TRADES_GIFTS_TAB = "trades-gifts"
export const ADMIN_LISTENERS_TAB = "admin"
/** Wire/nav id stays `"stored"` so persisted Game State nav does not break. */
export const STORAGE_TAB = "stored"

const CORE_GAME_STATE_TAB_IDS = new Set([
  "inventory",
  STORAGE_TAB,
  TRADES_GIFTS_TAB,
  ADMIN_LISTENERS_TAB,
])

export function isCoreGameStateTab(tabId: string): boolean {
  return CORE_GAME_STATE_TAB_IDS.has(tabId)
}
