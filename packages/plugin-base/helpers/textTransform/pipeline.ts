import type { TextEffect, TextSegment } from "@repo/types"
import { buildSegments, tokenizeWords } from "../chatTransform"
import {
  applyGateTransform,
  applyScrambleTransform,
  echoCount,
  netSizeShift,
  resolveBaseSize,
  resolveEchoSize,
} from "./effects"
import type { TextEffectStacks } from "./flags"

export interface AppliedTextEffects {
  content: string
  contentSegments: TextSegment[]
}

function sizeEffects(value: TextEffect["value"]): TextEffect[] {
  return [{ type: "size", value }]
}

/**
 * Apply text effects (scramble + size shift + cascading echoes + optional gate
 * masking) to a chat message `content` string. Returns `null` when no effects
 * are active so callers can skip the message untouched.
 *
 * Algorithm:
 * 0. If `scramble` stacks are active, scramble alpha letters via
 *    {@link applyScrambleTransform} — at 1x within each word, at 2x pooled
 *    across the message preserving word lengths, at 3x+ also randomising word
 *    count and lengths. The transformed string drives the subsequent steps.
 * 1. Tokenize the (possibly scrambled) input into words + trailing whitespace.
 * 2. For each word, optionally apply {@link applyGateTransform} when `gate` stacks
 *    are active (lowercase letters → visible `_` via Markdown `\_` escapes for chat).
 * 3. Emit one base segment (with size effect if shifted) and
 *    `echoCount(stacks)` cascading echo segments — each one step smaller than
 *    the previous, capped at `3xs`.
 * 4. Reassemble `content` and `contentSegments` via `buildSegments` so the
 *    plain string and styled segments stay consistent.
 */
export function applyTextEffects(
  content: string,
  stacks: TextEffectStacks,
): AppliedTextEffects | null {
  const echoes = echoCount(stacks)
  const shift = netSizeShift(stacks)
  const gate = stacks.gate > 0
  const scramble = stacks.scramble > 0
  if (echoes === 0 && shift === 0 && !gate && !scramble) return null

  const baseSize = resolveBaseSize(stacks)
  const transformed = scramble ? applyScrambleTransform(content, stacks.scramble) : content
  const tokens = tokenizeWords(transformed)
  return buildSegments(tokens, (token) => {
    if (!token.word) return []
    const word = gate ? applyGateTransform(token.word) : token.word
    const baseSegment: TextSegment = { text: word }
    if (baseSize) baseSegment.effects = sizeEffects(baseSize)
    const segments: TextSegment[] = [baseSegment]
    for (let i = 1; i <= echoes; i++) {
      segments.push({
        text: ` ${word}`,
        effects: sizeEffects(resolveEchoSize(stacks, i)),
      })
    }
    return segments
  })
}
