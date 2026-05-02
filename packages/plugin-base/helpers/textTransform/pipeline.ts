import type { TextEffect, TextSegment } from "@repo/types"
import { buildSegments, tokenizeWords } from "../chatTransform"
import {
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
 * Apply text effects (size shift + cascading echoes) to a chat message
 * `content` string. Returns `null` when no effects are active so callers can
 * skip the message untouched.
 *
 * Algorithm:
 * 1. Tokenize the input into words + trailing whitespace
 * 2. For each word, emit one base segment (with size effect if shifted) and
 *    `echoCount(stacks)` cascading echo segments — each one step smaller than
 *    the previous, capped at `3xs`.
 * 3. Reassemble `content` and `contentSegments` via `buildSegments` so the
 *    plain string and styled segments stay consistent.
 */
export function applyTextEffects(
  content: string,
  stacks: TextEffectStacks,
): AppliedTextEffects | null {
  const echoes = echoCount(stacks)
  const shift = netSizeShift(stacks)
  if (echoes === 0 && shift === 0) return null

  const baseSize = resolveBaseSize(stacks)
  const tokens = tokenizeWords(content)
  return buildSegments(tokens, (token) => {
    if (!token.word) return []
    const baseSegment: TextSegment = { text: token.word }
    if (baseSize) baseSegment.effects = sizeEffects(baseSize)
    const segments: TextSegment[] = [baseSegment]
    for (let i = 1; i <= echoes; i++) {
      segments.push({
        text: ` ${token.word}`,
        effects: sizeEffects(resolveEchoSize(stacks, i)),
      })
    }
    return segments
  })
}
