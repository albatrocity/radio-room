import type { GameAttributeName, GameStateModifier } from "@repo/types"

/**
 * Compute the effective delta to apply to `attribute` given the user's active
 * modifiers. Returns `null` when the attribute is locked.
 */
export function evaluateModifiers(
  amount: number,
  attribute: GameAttributeName,
  modifiers: GameStateModifier[],
  now: number,
): number | null {
  let multiplier = 1
  let additive = 0

  for (const modifier of modifiers) {
    if (modifier.startAt > now || modifier.endAt <= now) continue

    for (const effect of modifier.effects) {
      if (effect.type === "lock" && effect.target === attribute) {
        return null
      }
      if (effect.type === "multiplier" && effect.target === attribute) {
        multiplier *= effect.value
      } else if (effect.type === "additive" && effect.target === attribute) {
        additive += effect.value
      }
    }
  }

  return amount * multiplier + additive
}

/**
 * Split modifiers into active vs expired using `endAt <= now`.
 */
export function pruneExpiredModifiers(
  modifiers: GameStateModifier[],
  now: number,
): { active: GameStateModifier[]; expired: GameStateModifier[] } {
  const active: GameStateModifier[] = []
  const expired: GameStateModifier[] = []
  for (const modifier of modifiers) {
    if (modifier.endAt <= now) {
      expired.push(modifier)
    } else {
      active.push(modifier)
    }
  }
  return { active, expired }
}
