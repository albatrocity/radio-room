import type { TextSegment } from "@repo/types"

/**
 * One visual word (`word`) plus whitespace/punctuation that follows until the next word.
 */
export interface TokenizedWord {
  word: string
  /** Spaces / separators after `word` until the next `\S+` (may be empty). */
  trailing: string
}

/**
 * Split message content into runs of non-whitespace plus following whitespace.
 * Preserves leading whitespace as `{ word: "", trailing }`.
 */
export function tokenizeWords(content: string): TokenizedWord[] {
  const out: TokenizedWord[] = []
  const re = /(\S+)(\s*)/g
  let pos = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    if (m.index > pos) {
      out.push({ word: "", trailing: content.slice(pos, m.index) })
    }
    out.push({ word: m[1]!, trailing: m[2] ?? "" })
    pos = re.lastIndex
  }
  if (pos < content.length) {
    out.push({ word: "", trailing: content.slice(pos) })
  }
  return out
}

/**
 * Build plain `content` and typed `contentSegments` from tokenized words.
 * `perWord` returns segments for the non-empty `word` portion only; `trailing`
 * is appended as plain segments after each token.
 */
export function buildSegments(
  tokens: TokenizedWord[],
  perWord: (token: TokenizedWord, index: number) => TextSegment[],
): { content: string; contentSegments: TextSegment[] } {
  const contentSegments: TextSegment[] = []
  let content = ""
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!
    if (t.word === "" && t.trailing) {
      contentSegments.push({ text: t.trailing })
      content += t.trailing
      continue
    }
    if (t.word) {
      for (const seg of perWord(t, i)) {
        contentSegments.push(seg)
        content += seg.text
      }
    }
    if (t.trailing) {
      contentSegments.push({ text: t.trailing })
      content += t.trailing
    }
  }
  return { content, contentSegments }
}
