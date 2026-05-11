import type { GameStateModifier } from "@repo/types"

/**
 * Count modifier stacks per distinct flag name: each non-expired modifier
 * contributes at most +1 per flag it enables (duplicate `flag` effects of the
 * same name in one modifier still count as one).
 */
export function countFlagStacks(
  modifiers: GameStateModifier[] | undefined,
  now: number,
): Readonly<Record<string, number>> {
  const stacks: Record<string, number> = {}
  for (const modifier of modifiers ?? []) {
    if (modifier.startAt > now || modifier.endAt <= now) continue
    const distinctInModifier = new Set<string>()
    for (const effect of modifier.effects) {
      if (effect.type !== "flag" || effect.value !== true) continue
      distinctInModifier.add(effect.name)
    }
    for (const name of Array.from(distinctInModifier)) {
      stacks[name] = (stacks[name] ?? 0) + 1
    }
  }
  return stacks
}
