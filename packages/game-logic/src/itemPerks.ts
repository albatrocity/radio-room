import type { GameStateModifier } from "@repo/types"

/** Pizza Slice: the holder's next first vote in a core poll counts twice (ADR 0228). */
export const DOUBLE_VOTE_FLAG = "double_vote"

/** Weight stored for a vote cast under `DOUBLE_VOTE_FLAG`. */
export const DOUBLE_VOTE_WEIGHT = 2

/** Multiplier target scaling the holder's shop buy prices (Negotiating for Dummies). */
export const SHOP_PRICE_ATTRIBUTE = "shop:price" as const

/** The first active modifier carrying flag `name`, if any. */
export function activeFlagModifier(
  modifiers: readonly GameStateModifier[] | undefined,
  name: string,
  now: number,
): GameStateModifier | undefined {
  return (modifiers ?? []).find(
    (modifier) =>
      modifier.startAt <= now &&
      modifier.endAt > now &&
      modifier.effects.some(
        (effect) => effect.type === "flag" && effect.name === name && effect.value,
      ),
  )
}

/** Scale for the user's shop buy prices; 1 without a discount. */
export function shopPriceScale(
  modifiers: readonly GameStateModifier[] | undefined,
  now: number,
): number {
  let scale = 1
  for (const modifier of modifiers ?? []) {
    if (modifier.startAt > now || modifier.endAt <= now) continue
    for (const effect of modifier.effects) {
      if (effect.type === "multiplier" && effect.target === SHOP_PRICE_ATTRIBUTE) {
        scale *= effect.value
      }
    }
  }
  return scale
}
