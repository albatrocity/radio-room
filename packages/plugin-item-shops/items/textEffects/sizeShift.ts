import type { TextEffectKind, TextEffectStacks } from "@repo/plugin-base"
import type { TextEffect, TextSegment } from "@repo/types"
import {
  MAX_SIZE_SHIFT,
  baseTextSizeFromNetShift,
  textSizeFromNetShift,
} from "@repo/plugin-base"
import { COMIC_SANS_FLAG, ECHO_FLAG, GROW_FLAG, SHRINK_FLAG } from "./textEffectFlags"

function clampNetShift(shift: number): number {
  if (shift > MAX_SIZE_SHIFT) return MAX_SIZE_SHIFT
  if (shift < -MAX_SIZE_SHIFT) return -MAX_SIZE_SHIFT
  return shift
}

function netSizeShift(stacks: TextEffectStacks): number {
  return clampNetShift((stacks[GROW_FLAG] ?? 0) - (stacks[SHRINK_FLAG] ?? 0))
}

const MAX_ECHO = 4

function echoCount(stacks: TextEffectStacks): number {
  const e = stacks[ECHO_FLAG] ?? 0
  if (e <= 0) return 0
  return Math.min(e, MAX_ECHO)
}

/** Base word font size from grow/shrink stacks (decorate phase). */
export const sizeShiftTextEffect: TextEffectKind = {
  phase: "decorate",
  activeWhen: (stacks) => baseTextSizeFromNetShift(netSizeShift(stacks)) != null,
  order: 0,
  effects: (stacks) => {
    const base = baseTextSizeFromNetShift(netSizeShift(stacks))
    if (!base) return []
    return [{ type: "size", value: base }]
  },
}

/** Per-word echo segments with cascading smaller sizes (multiply phase). */
export const echoTextEffect: TextEffectKind = {
  phase: "multiply",
  activeWhen: ECHO_FLAG,
  buildExtras: (_base, stacks, _ctx, word): TextSegment[] => {
    const n = echoCount(stacks)
    const net = netSizeShift(stacks)
    const out: TextSegment[] = []
    for (let i = 1; i <= n; i++) {
      const effects: TextEffect[] = [{ type: "size", value: textSizeFromNetShift(net - i) }]
      if ((stacks[COMIC_SANS_FLAG] ?? 0) > 0) {
        effects.push({ type: "font", value: "comicSans" })
      }
      out.push({ text: ` ${word}`, effects })
    }
    return out
  },
}
