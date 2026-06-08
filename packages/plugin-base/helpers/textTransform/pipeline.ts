import type { TextSegment } from "@repo/types"
import { buildSegments, tokenizeWords } from "../chatTransform"
import type { TextEffectKind, TextEffectStacks, WordContext } from "./types"

export interface AppliedTextEffects {
  content: string
  contentSegments: TextSegment[]
}

function isKindActive(kind: TextEffectKind, stacks: TextEffectStacks): boolean {
  if (typeof kind.activeWhen === "string") {
    return (stacks[kind.activeWhen] ?? 0) > 0
  }
  return kind.activeWhen(stacks)
}

function filterActiveKinds(
  kinds: readonly TextEffectKind[],
  stacks: TextEffectStacks,
): TextEffectKind[] {
  return kinds.filter((k) => isKindActive(k, stacks))
}

function sortByOrder(a: TextEffectKind, b: TextEffectKind): number {
  return (a.order ?? 0) - (b.order ?? 0)
}

function refineSegmentsWithKind(
  segments: TextSegment[],
  k: Extract<TextEffectKind, { phase: "segment" }>,
  stacks: TextEffectStacks,
  ctx: WordContext,
): TextSegment[] {
  const refined: TextSegment[] = []
  for (const seg of segments) {
    const subSegs = k.build(seg.text, stacks, ctx)
    if (subSegs != null && subSegs.length > 0) {
      for (const sub of subSegs) {
        const mergedEffects = [...(seg.effects ?? []), ...(sub.effects ?? [])]
        sub.effects = mergedEffects.length > 0 ? mergedEffects : undefined
      }
      refined.push(...subSegs)
    } else {
      refined.push(seg)
    }
  }
  return refined
}

function runSegmentPipeline(
  segmentKinds: Extract<TextEffectKind, { phase: "segment" }>[],
  word: string,
  stacks: TextEffectStacks,
  ctx: WordContext,
): TextSegment[] {
  let segments: TextSegment[] | null = null
  for (const k of segmentKinds) {
    if (segments == null) {
      segments = k.build(word, stacks, ctx)
    } else {
      segments = refineSegmentsWithKind(segments, k, stacks, ctx)
    }
  }
  return segments ?? [{ text: word }]
}

/**
 * Apply registered text effect kinds to chat message content.
 * Returns `null` when no kinds are active so callers can skip the message untouched.
 */
export function applyTextEffects(
  content: string,
  stacks: TextEffectStacks,
  kinds: readonly TextEffectKind[],
): AppliedTextEffects | null {
  const active = filterActiveKinds(kinds, stacks)
  if (active.length === 0) return null

  const contentKinds = active
    .filter((k): k is Extract<TextEffectKind, { phase: "content" }> => k.phase === "content")
    .sort(sortByOrder)

  let transformed = content
  for (const k of contentKinds) {
    transformed = k.transform(transformed, stacks)
  }

  const tokens = tokenizeWords(transformed)
  const allWords = tokens.filter((t) => t.word !== "").map((t) => t.word)
  const wordCount = allWords.length

  let wordOrdinal = 0

  const wordKinds = active
    .filter((k): k is Extract<TextEffectKind, { phase: "word" }> => k.phase === "word")
    .sort(sortByOrder)
  const segmentKinds = active
    .filter((k): k is Extract<TextEffectKind, { phase: "segment" }> => k.phase === "segment")
    .sort(sortByOrder)
  const decorateKinds = active
    .filter((k): k is Extract<TextEffectKind, { phase: "decorate" }> => k.phase === "decorate")
    .sort(sortByOrder)
  const multiplyKinds = active
    .filter((k): k is Extract<TextEffectKind, { phase: "multiply" }> => k.phase === "multiply")
    .sort(sortByOrder)

  return buildSegments(tokens, (token) => {
    if (!token.word) return []

    const ctx: WordContext = {
      wordIndex: wordOrdinal,
      wordCount,
      allWords,
    }
    wordOrdinal += 1

    let word = token.word
    for (const k of wordKinds) {
      word = k.transform(word, stacks, ctx)
    }

    let segments = runSegmentPipeline(segmentKinds, word, stacks, ctx)

    for (const seg of segments) {
      const merged = [...(seg.effects ?? [])]
      for (const dk of decorateKinds) {
        merged.push(...dk.effects(stacks, ctx))
      }
      seg.effects = merged.length ? merged : undefined
    }

    let acc = segments
    for (const mk of multiplyKinds) {
      acc = [...acc, ...mk.buildExtras(acc, stacks, ctx, word)]
    }

    return acc
  })
}
