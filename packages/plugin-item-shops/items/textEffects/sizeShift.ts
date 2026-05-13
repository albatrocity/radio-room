import type { TextEffectKind, TextEffectStacks } from "@repo/plugin-base"
import type { TextEffect, TextSegment } from "@repo/types"
import {
  MAX_SIZE_SHIFT,
  baseTextSizeFromNetShift,
  textSizeFromNetShift,
} from "@repo/plugin-base"

/**
 * Cross-folder flag constants for chat text effects.
 *
 * These flags are written by one item (e.g. `boost-pedal` writes `GROW_FLAG`)
 * and read by kinds in this file (`sizeShiftTextEffect`, `echoTextEffect`) plus
 * any item that wants to react to them. Because writer and readers live in
 * different folders, the named constant exists to prevent string drift.
 *
 * **`echoTextEffect`** (multiply phase) appends a leading space plus a copy of each
 * base word segment per echo tier, carrying that segment's non-`size` effects so
 * per-letter `segment` colors compose with delay/echo.
 *
 * Self-contained flags (where one item is both sole writer and sole reader)
 * are inlined as string literals at their item file and have no constant here.
 */
export const GROW_FLAG = "grow"
export const SHRINK_FLAG = "shrink"
export const ECHO_FLAG = "echo"

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
