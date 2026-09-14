import type { LyricHeroPhrase } from "./types"

/**
 * Parse a pasted lyric phrase bank into Lyric Hero config rows.
 *
 * Format: one phrase per non-empty line. Blank lines and `#` comments are
 * ignored. Optional leading list markers (`- `, `* `, `1. `) are stripped.
 */
export function parseLyricPhrasesImport(rawText: string): LyricHeroPhrase[] {
  const lines = rawText.replace(/\r\n/g, "\n").split("\n")
  const rows: LyricHeroPhrase[] = []

  for (const line of lines) {
    let trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue

    trimmed = trimmed.replace(/^[-*]\s+/, "").replace(/^\d+[.)]\s+/, "").trim()
    if (!trimmed) continue

    rows.push({ text: trimmed })
  }

  return rows
}
