import type { GameStateModifier } from "@repo/types"

/** Timed modifier flag: stackable UI blur on the web client (`apps/web` overlay). */
export const INTERFACE_BLUR_FLAG = "interface_blur"

/** Timed modifier flag: stackable viewport saturation on the web client (`backdrop-filter`). */
export const INTERFACE_SATURATE_FLAG = "interface_saturate"

function countModifierStacksForFlag(
  modifiers: GameStateModifier[] | undefined,
  now: number,
  flagName: string,
): number {
  let stacks = 0
  for (const modifier of modifiers ?? []) {
    if (modifier.startAt > now || modifier.endAt <= now) continue
    const has = modifier.effects.some(
      (effect) => effect.type === "flag" && effect.name === flagName && effect.value === true,
    )
    if (has) stacks += 1
  }
  return stacks
}

/**
 * Count active modifiers that apply the interface blur flag (one stack per modifier).
 */
export function countInterfaceBlurStacks(
  modifiers: GameStateModifier[] | undefined,
  now: number,
): number {
  return countModifierStacksForFlag(modifiers, now, INTERFACE_BLUR_FLAG)
}

/**
 * Count active modifiers that apply the interface saturation flag (one stack per modifier).
 */
export function countInterfaceSaturateStacks(
  modifiers: GameStateModifier[] | undefined,
  now: number,
): number {
  return countModifierStacksForFlag(modifiers, now, INTERFACE_SATURATE_FLAG)
}
