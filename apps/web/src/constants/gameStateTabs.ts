export const TRADES_GIFTS_TAB = "trades-gifts"
export const ADMIN_LISTENERS_TAB = "admin"
export const STORED_ITEMS_TAB = "stored"

const CORE_GAME_STATE_TAB_IDS = new Set([
  "inventory",
  STORED_ITEMS_TAB,
  TRADES_GIFTS_TAB,
  ADMIN_LISTENERS_TAB,
])

export function isCoreGameStateTab(tabId: string): boolean {
  return CORE_GAME_STATE_TAB_IDS.has(tabId)
}
