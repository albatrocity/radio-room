import type { GameStateModifier } from "@repo/types"

export const SHRINK_FLAG = "shrink"
export const GROW_FLAG = "grow"
export const ECHO_FLAG = "echo"
export const GATE_FLAG = "gate"
export const SCRAMBLE_FLAG = "scramble"
export const COMIC_SANS_FLAG = "comic_sans"

/** Stack counts for each text effect (0 = inactive). */
export interface TextEffectStacks {
  shrink: number
  grow: number
  echo: number
  gate: number
  scramble: number
  comicSans: number
}

/**
 * Count active flag instances for the supported text-effect flags.
 */
export function countTextEffectStacks(
  modifiers: GameStateModifier[] | undefined,
  now: number,
): TextEffectStacks {
  const stacks: TextEffectStacks = {
    shrink: 0,
    grow: 0,
    echo: 0,
    gate: 0,
    scramble: 0,
    comicSans: 0,
  }
  for (const modifier of modifiers ?? []) {
    if (modifier.startAt > now || modifier.endAt <= now) continue
    let setShrink = false
    let setGrow = false
    let setEcho = false
    let setGate = false
    let setScramble = false
    let setComicSans = false
    for (const effect of modifier.effects) {
      if (effect.type !== "flag" || effect.value !== true) continue
      if (effect.name === SHRINK_FLAG) setShrink = true
      else if (effect.name === GROW_FLAG) setGrow = true
      else if (effect.name === ECHO_FLAG) setEcho = true
      else if (effect.name === GATE_FLAG) setGate = true
      else if (effect.name === SCRAMBLE_FLAG) setScramble = true
      else if (effect.name === COMIC_SANS_FLAG) setComicSans = true
    }
    if (setShrink) stacks.shrink += 1
    if (setGrow) stacks.grow += 1
    if (setEcho) stacks.echo += 1
    if (setGate) stacks.gate += 1
    if (setScramble) stacks.scramble += 1
    if (setComicSans) stacks.comicSans += 1
  }
  return stacks
}
