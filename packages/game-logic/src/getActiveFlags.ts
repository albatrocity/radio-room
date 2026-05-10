import type { GameStateModifier } from "@repo/types"

/**
 * Derive boolean flags from non-expired `flag` effects on active modifiers.
 * See ADR 0046 (canonical read path when you already have a modifier list).
 */
export function getActiveFlags(
  modifiers: GameStateModifier[] | undefined,
  now: number,
): Record<string, boolean> {
  const list = modifiers ?? []
  const flags: Record<string, boolean> = {}
  for (const modifier of list) {
    if (modifier.startAt > now || modifier.endAt <= now) continue
    for (const effect of modifier.effects) {
      if (effect.type === "flag") {
        flags[effect.name] = effect.value
      }
    }
  }
  return flags
}
