import type { GameStateModifier, UserGameState } from "@repo/types"

/** True when the user has an active `lock` effect on `coin`. */
export function hasActiveCoinLock(
  state: UserGameState | null | undefined,
  now = Date.now(),
): boolean {
  if (!state?.modifiers?.length) return false
  return state.modifiers.some((m) => modifierLocksCoin(m, now))
}

export function modifierLocksCoin(modifier: GameStateModifier, now: number): boolean {
  if (modifier.startAt > now || modifier.endAt <= now) return false
  return modifier.effects.some((e) => e.type === "lock" && e.target === "coin")
}
