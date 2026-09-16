/**
 * Sweetwater follow-up keys and "do not call" screening, kept in a leaf module so items
 * (e.g. Spy World's Call Screener) can reach this shop's state without importing
 * `SWEETWATER_SHOP` — shop modules import `items`, so the reverse would cycle (ADR 0183).
 */

export const SWEETWATER_SHOP_ID = "sweetwater"

/** Timer id (shop-scoped) for a user's pending sales-rep follow-up. */
export function sweetwaterTimerId(userId: string): string {
  return `followup:${userId}`
}

/**
 * State key for a user's screening flag. Distinct from the bare `userId` key, which holds
 * the last-purchase blob the follow-up copy reads.
 */
export function doNotCallStateKey(userId: string): string {
  return `do-not-call:${userId}`
}

/** True when this user has screened the sales rep for the rest of the game session. */
export function isSweetwaterDoNotCall(
  getState: <T>(key: string) => T | undefined,
  userId: string,
): boolean {
  return getState<boolean>(doNotCallStateKey(userId)) === true
}

/** Screen the rep for this user and drop any follow-up already scheduled. */
export function applySweetwaterDoNotCall(
  store: {
    setState: <T>(key: string, value: T) => void
    clearTimer: (id: string) => boolean
  },
  userId: string,
): void {
  store.setState<boolean>(doNotCallStateKey(userId), true)
  store.clearTimer(sweetwaterTimerId(userId))
}
