import type { LyricHeroPhrase } from "./types"

/**
 * Parse a pasted lyric phrase bank into Lyric Hero config rows.
 *
 * Format: one phrase per non-empty line. Blank lines and `#` comments are
 * ignored. Optional leading list markers (`- `, `* `, `1. `) are stripped.
 * Optional hint after the first ` | ` separator (`phrase | hint`).
 */
export function parseLyricPhrasesImport(rawText: string): LyricHeroPhrase[] {
  const lines = rawText.replace(/\r\n/g, "\n").split("\n")
  const rows: LyricHeroPhrase[] = []

  for (const line of lines) {
    let trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue

    trimmed = trimmed.replace(/^[-*]\s+/, "").replace(/^\d+[.)]\s+/, "").trim()
    if (!trimmed) continue

    const pipeIdx = trimmed.indexOf(" | ")
    if (pipeIdx >= 0) {
      const text = trimmed.slice(0, pipeIdx).trim()
      const hint = trimmed.slice(pipeIdx + 3).trim()
      if (!text) continue
      rows.push({ text, hint })
      continue
    }

    rows.push({ text: trimmed, hint: "" })
  }

  return rows
}
