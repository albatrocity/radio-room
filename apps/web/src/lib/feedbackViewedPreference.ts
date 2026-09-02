/**
 * Per-room set of feedback topic ids the user has viewed in the Feedback surface.
 * Source-owned domain state for ADR 0144 raises (not a parallel badge store).
 */

const PREFIX = "radioroom:feedback-viewed"

function storageKey(roomId: string) {
  return `${PREFIX}:${roomId}`
}

export function getViewedFeedbackTopicIds(roomId: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(roomId))
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((id): id is string => typeof id === "string"))
  } catch {
    return new Set()
  }
}

export function markFeedbackTopicsViewed(roomId: string, topicIds: string[]): void {
  const next = getViewedFeedbackTopicIds(roomId)
  for (const id of topicIds) next.add(id)
  localStorage.setItem(storageKey(roomId), JSON.stringify([...next]))
}
