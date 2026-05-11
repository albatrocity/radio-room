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

function warnSegmentConflict(kindId: string): void {
  if (typeof console !== "undefined" && console.warn) {
    console.warn(
      `[applyTextEffects] Multiple segment kinds produced output for the same word; using last registered non-null result (${kindId}).`,
    )
  }
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

  const contentKinds = active.filter((k): k is Extract<TextEffectKind, { phase: "content" }> => k.phase === "content").sort(sortByOrder)

  let transformed = content
  for (const k of contentKinds) {
    transformed = k.transform(transformed, stacks)
  }

  const tokens = tokenizeWords(transformed)
  const allWords = tokens.filter((t) => t.word !== "").map((t) => t.word)
  const wordCount = allWords.length

  let wordOrdinal = 0

  const wordKinds = active.filter((k): k is Extract<TextEffectKind, { phase: "word" }> => k.phase === "word").sort(sortByOrder)
  const segmentKinds = active.filter((k): k is Extract<TextEffectKind, { phase: "segment" }> => k.phase === "segment").sort(sortByOrder)
  const decorateKinds = active.filter((k): k is Extract<TextEffectKind, { phase: "decorate" }> => k.phase === "decorate").sort(sortByOrder)
  const multiplyKinds = active.filter((k): k is Extract<TextEffectKind, { phase: "multiply" }> => k.phase === "multiply").sort(sortByOrder)

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

    let segments: TextSegment[] | null = null
    for (const k of segmentKinds) {
      const built = k.build(word, stacks, ctx)
      if (built != null) {
        if (segments != null) {
          warnSegmentConflict(String(k.activeWhen))
        } else {
          segments = built
        }
      }
    }
    if (segments == null) {
      segments = [{ text: word }]
    }

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
