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

type SizeValue = Extract<TextEffect, { type: "size" }>["value"]

function sizeEffects(value: SizeValue): TextEffect[] {
  return [{ type: "size", value }]
}

const COMIC_SANS_EFFECT: TextEffect = { type: "font", value: "comicSans" }

function withComicSans(
  effects: TextEffect[] | undefined,
  stacks: TextEffectStacks,
): TextEffect[] | undefined {
  if (stacks.comicSans <= 0) return effects
  if (!effects?.length) return [COMIC_SANS_EFFECT]
  return [...effects, COMIC_SANS_EFFECT]
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
 * 5. When `comicSans` stacks are active, append a `font` effect to each word
 *    segment (and echoes) for Comic Sans rendering in the client.
 */
export function applyTextEffects(
  content: string,
  stacks: TextEffectStacks,
): AppliedTextEffects | null {
  const echoes = echoCount(stacks)
  const shift = netSizeShift(stacks)
  const gate = stacks.gate > 0
  const scramble = stacks.scramble > 0
  if (echoes === 0 && shift === 0 && !gate && !scramble && stacks.comicSans <= 0) return null

  const baseSize = resolveBaseSize(stacks)
  const transformed = scramble ? applyScrambleTransform(content, stacks.scramble) : content
  const tokens = tokenizeWords(transformed)
  return buildSegments(tokens, (token) => {
    if (!token.word) return []
    const word = gate ? applyGateTransform(token.word) : token.word
    const baseSegment: TextSegment = { text: word }
    const baseEffects = baseSize ? sizeEffects(baseSize) : undefined
    baseSegment.effects = withComicSans(baseEffects, stacks)
    const segments: TextSegment[] = [baseSegment]
    for (let i = 1; i <= echoes; i++) {
      segments.push({
        text: ` ${word}`,
        effects: withComicSans(sizeEffects(resolveEchoSize(stacks, i)), stacks),
      })
    }
    return segments
  })
}
