/**
 * Parse listener-facing whats-new.md into month sections (ADR 0177).
 * Newest month is expected first in the source file; order is preserved.
 */

const MONTH_NAMES: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
}

export type WhatsNewMonth = {
  /** Sortable id, e.g. `2026-09`. */
  id: string
  /** Display heading, e.g. `September 2026`. */
  heading: string
  /** Markdown body under the month heading (intro + ### New / ### Fixed). */
  bodyMarkdown: string
}

const MONTH_HEADING_RE = /^##\s+([A-Za-z]+)\s+(\d{4})\s*$/

function monthId(monthName: string, year: string): string | null {
  const month = MONTH_NAMES[monthName.toLowerCase()]
  if (!month) return null
  return `${year}-${String(month).padStart(2, "0")}`
}

/**
 * Split raw markdown on `## Month YYYY` headings.
 * Non-matching `##` lines are ignored (not treated as months).
 */
export function parseWhatsNew(raw: string): WhatsNewMonth[] {
  const lines = raw.replace(/\r\n/g, "\n").split("\n")
  const months: WhatsNewMonth[] = []
  let current: { id: string; heading: string; bodyLines: string[] } | null = null

  const flush = () => {
    if (!current) return
    months.push({
      id: current.id,
      heading: current.heading,
      bodyMarkdown: current.bodyLines.join("\n").trim(),
    })
    current = null
  }

  for (const line of lines) {
    const match = line.match(MONTH_HEADING_RE)
    if (match) {
      const [, monthName, year] = match
      const id = monthId(monthName, year)
      if (!id) continue
      flush()
      current = {
        id,
        heading: `${monthName[0]!.toUpperCase()}${monthName.slice(1).toLowerCase()} ${year}`,
        bodyLines: [],
      }
      continue
    }
    if (current) {
      current.bodyLines.push(line)
    }
  }
  flush()

  return months
}

/** Latest (first) month id, or null when the file has no parseable months. */
export function latestWhatsNewMonthId(months: WhatsNewMonth[]): string | null {
  return months[0]?.id ?? null
}
