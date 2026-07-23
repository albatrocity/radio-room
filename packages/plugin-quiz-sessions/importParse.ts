/**
 * Parse a pasted markdown-ish question bank into quiz config rows.
 *
 * Format: question text (one or more lines), then `-` / `*` answer lines.
 * Blank lines are ignored. A new question starts when non-bullet text appears
 * after answers have been seen for the current question.
 */
export function parseQuizQuestionsImport(
  rawText: string,
): { text: string; acceptedAnswers: string[] }[] {
  const lines = rawText.replace(/\r\n/g, "\n").split("\n")
  const rows: { text: string; acceptedAnswers: string[] }[] = []
  let current: { textParts: string[]; acceptedAnswers: string[] } | null = null
  let sawAnswers = false

  const flush = () => {
    if (!current) return
    const text = current.textParts.join(" ").trim()
    if (text) {
      rows.push({ text, acceptedAnswers: current.acceptedAnswers })
    }
    current = null
    sawAnswers = false
  }

  for (const line of lines) {
    const bullet = line.match(/^\s*[-*]\s+(.*)$/)
    if (bullet) {
      if (!current) continue
      const answer = bullet[1].trim()
      if (answer) current.acceptedAnswers.push(answer)
      sawAnswers = true
      continue
    }

    const trimmed = line.trim()
    if (!trimmed) continue

    if (current && sawAnswers) flush()
    if (!current) {
      current = { textParts: [trimmed], acceptedAnswers: [] }
    } else {
      current.textParts.push(trimmed)
    }
  }

  flush()
  return rows
}
