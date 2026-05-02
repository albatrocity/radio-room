import type { TextEffect } from "@repo/types"
import type { TextEffectStacks } from "./flags"

/**
 * Size scale ordered from smallest to largest. The base index `NORMAL_INDEX`
 * represents normal/`md` text; positive offsets grow text, negative offsets
 * shrink it. Values map directly to `TextEffect["value"]` size names.
 */
const SIZE_SCALE = [
  "3xs",
  "2xs",
  "xs",
  "sm",
  "normal",
  "lg",
  "xl",
  "2xl",
  "3xl",
] as const satisfies ReadonlyArray<TextEffect["value"]>

const NORMAL_INDEX = 4
const MIN_INDEX = 0
const MAX_INDEX = SIZE_SCALE.length - 1
const MAX_SHIFT = NORMAL_INDEX // +/-4
const MAX_ECHO = 4

function clampShift(shift: number): number {
  if (shift > MAX_SHIFT) return MAX_SHIFT
  if (shift < -MAX_SHIFT) return -MAX_SHIFT
  return shift
}

function sizeForIndex(index: number): TextEffect["value"] {
  const clamped = Math.max(MIN_INDEX, Math.min(MAX_INDEX, index))
  return SIZE_SCALE[clamped]!
}

/**
 * Net size shift = `grow - shrink`, clamped to the supported range
 * (`+/-4`). Positive values produce larger text, negative values smaller.
 */
export function netSizeShift(stacks: TextEffectStacks): number {
  return clampShift(stacks.grow - stacks.shrink)
}

/**
 * Resolve the base text size for a chat word. Returns `null` when no size
 * shift is needed (so callers can omit the size effect entirely). The legacy
 * `"normal"` value is used at shift 0 only when an echo follows; otherwise
 * we return `null` to keep payloads minimal.
 */
export function resolveBaseSize(stacks: TextEffectStacks): TextEffect["value"] | null {
  const shift = netSizeShift(stacks)
  if (shift === 0) return null
  return sizeForIndex(NORMAL_INDEX + shift)
}

/**
 * Resolve the size for the Nth echo (1-indexed). Each echo is one step smaller
 * than the previous, creating a fading cascade. Sizes are clamped at `3xs`.
 */
export function resolveEchoSize(
  stacks: TextEffectStacks,
  echoIndex: number,
): TextEffect["value"] {
  const baseShift = netSizeShift(stacks)
  const echoShift = baseShift - echoIndex
  return sizeForIndex(NORMAL_INDEX + echoShift)
}

/** Number of echo repetitions per word (echo stacks, capped at 4). */
export function echoCount(stacks: TextEffectStacks): number {
  if (stacks.echo <= 0) return 0
  return Math.min(stacks.echo, MAX_ECHO)
}
