import type { TextEffect, TextSegment } from "@repo/types"

/** Stack counts keyed by modifier flag name — opaque strings from game modifiers. */
export type TextEffectStacks = Readonly<Record<string, number>>

/** Per-word context passed to every per-word phase. Enables content-scoped targeting. */
export interface WordContext {
  /** Index of this word among all non-empty words in the (post-content-phase) message. */
  wordIndex: number
  /** Total number of non-empty words. */
  wordCount: number
  /** All words (post-content-phase, pre-word-phase) in registration order. Read-only. */
  allWords: readonly string[]
}

interface BaseKind {
  /** Flag name (must have stacks[name] > 0) or predicate over stacks. Kind runs only when active. */
  activeWhen: string | ((stacks: TextEffectStacks) => boolean)
  /** Lower runs earlier within its phase. Default 0. */
  order?: number
}

export type TextEffectKind =
  | (BaseKind & {
      phase: "content"
      transform(content: string, stacks: TextEffectStacks): string
    })
  | (BaseKind & {
      phase: "word"
      transform(word: string, stacks: TextEffectStacks, ctx: WordContext): string
    })
  | (BaseKind & {
      phase: "segment"
      build(word: string, stacks: TextEffectStacks, ctx: WordContext): TextSegment[] | null
    })
  | (BaseKind & {
      phase: "decorate"
      effects(stacks: TextEffectStacks, ctx: WordContext): TextEffect[]
    })
  | (BaseKind & {
      phase: "multiply"
      buildExtras(
        base: TextSegment[],
        stacks: TextEffectStacks,
        ctx: WordContext,
        word: string,
      ): TextSegment[]
    })
