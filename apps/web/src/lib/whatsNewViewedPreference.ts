/**
 * Global set of What’s new month ids the listener has viewed (ADR 0177).
 * Not per-room — the changelog is app-wide.
 */

const STORAGE_KEY = "radioroom:whats-new-viewed"

export function getViewedWhatsNewMonthIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((id): id is string => typeof id === "string"))
  } catch {
    return new Set()
  }
}

export function markWhatsNewMonthViewed(monthId: string): void {
  const next = getViewedWhatsNewMonthIds()
  next.add(monthId)
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
}

export function hasViewedWhatsNewMonth(monthId: string): boolean {
  return getViewedWhatsNewMonthIds().has(monthId)
}
