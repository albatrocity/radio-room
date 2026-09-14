import type { TextEffect, TextSegment } from "@repo/types"
import type { TextEffectKind, TextEffectStacks } from "../../../plugin-base/helpers/textTransform/types"
import {
  baseTextSizeFromNetShift,
  textSizeFromNetShift,
} from "../../../plugin-base/helpers/textTransform/effects"
import { ECHO_FLAG, GROW_FLAG, SHRINK_FLAG } from "./flags"

export { ECHO_FLAG, GROW_FLAG, SHRINK_FLAG } from "./flags"

/** Mirrors `MAX_SIZE_SHIFT` in plugin-base (NORMAL_INDEX = 4). Keep in sync. */
const MAX_SIZE_SHIFT = 4

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
  buildExtras: (base, stacks, _ctx, _word): TextSegment[] => {
    const n = echoCount(stacks)
    if (n <= 0 || base.length === 0) return []
    const net = netSizeShift(stacks)
    const out: TextSegment[] = []
    for (let i = 1; i <= n; i++) {
      const sizeEffect: TextEffect = {
        type: "size",
        value: textSizeFromNetShift(net - i),
      }
      out.push({ text: " ", effects: [sizeEffect] })
      for (const seg of base) {
        const inherited = (seg.effects ?? []).filter((e) => e.type !== "size")
        out.push({
          text: seg.text,
          effects: [sizeEffect, ...inherited],
        })
      }
    }
    return out
  },
}
