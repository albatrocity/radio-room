import type { GameStateModifier } from "@repo/types"

/**
 * Flag name for text shrinking effect. Each active modifier with this flag
 * reduces the rendered chat text size by one step (capped at `3xs`).
 */
export const SHRINK_FLAG = "shrink"

/**
 * Flag name for text growing effect. Each active modifier with this flag
 * increases the rendered chat text size by one step (capped at `3xl`).
 */
export const GROW_FLAG = "grow"

/**
 * Flag name for echo/repeat effect. Each active modifier with this flag adds
 * an additional echo of every word, with each successive echo one size step
 * smaller than the previous.
 */
export const ECHO_FLAG = "echo"

/**
 * Flag name for text gating effect. Each active modifier with this flag replaces
 * lowercase letters with underscores (escaped for Markdown chat rendering).
 */
export const GATE_FLAG = "gate"

/** Stack counts for each text effect (0 = inactive). */
export interface TextEffectStacks {
  shrink: number
  grow: number
  echo: number
  gate: number
}

/**
 * Count active flag instances for the supported text-effect flags. Unlike
 * `getActiveFlags` (which returns booleans), this counts how many active
 * modifiers set each flag, enabling stacked effects (e.g., 2x shrink = smaller
 * text than 1x shrink).
 *
 * Same time-window rules as `getActiveFlags`/`evaluateModifiers`: a modifier is
 * active when `startAt <= now < endAt`. Each modifier counts as 1 stack
 * regardless of how many `flag` effects with the same name it carries (a
 * modifier setting `shrink` twice still contributes 1 to `shrink`).
 */
export function countTextEffectStacks(
  modifiers: GameStateModifier[] | undefined,
  now: number,
): TextEffectStacks {
  const stacks: TextEffectStacks = { shrink: 0, grow: 0, echo: 0, gate: 0 }
  for (const modifier of modifiers ?? []) {
    if (modifier.startAt > now || modifier.endAt <= now) continue
    let setShrink = false
    let setGrow = false
    let setEcho = false
    let setGate = false
    for (const effect of modifier.effects) {
      if (effect.type !== "flag" || effect.value !== true) continue
      if (effect.name === SHRINK_FLAG) setShrink = true
      else if (effect.name === GROW_FLAG) setGrow = true
      else if (effect.name === ECHO_FLAG) setEcho = true
      else if (effect.name === GATE_FLAG) setGate = true
    }
    if (setShrink) stacks.shrink += 1
    if (setGrow) stacks.grow += 1
    if (setEcho) stacks.echo += 1
    if (setGate) stacks.gate += 1
  }
  return stacks
}
