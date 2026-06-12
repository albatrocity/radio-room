/**
 * Per-room poll authoring draft (admin Settings → Polls).
 *
 * Values: `radioroom:poll-draft:{roomId}`
 * LRU index: `radioroom:poll-draft:index` (JSON array of roomIds)
 *
 * Concurrent writes from two tabs in the same room can clobber the index —
 * eventual consistency is acceptable for a UX preference.
 */

export type PollDraft = {
  question: string
  options: string[]
  hideRunningTotal: boolean
}

export const EMPTY_POLL_DRAFT: PollDraft = {
  question: "",
  options: ["", ""],
  hideRunningTotal: false,
}

const PREFIX = "radioroom:poll-draft"
const INDEX_KEY = `${PREFIX}:index`
const MAX_ENTRIES = 100

function storageKey(roomId: string) {
  return `${PREFIX}:${roomId}`
}

export function readPollDraftIndex(): string[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((k) => typeof k === "string") : []
  } catch {
    return []
  }
}

export function writePollDraftIndex(index: string[]) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(index))
}

function touchIndex(roomId: string) {
  const index = readPollDraftIndex().filter((k) => k !== roomId)
  index.unshift(roomId)

  while (index.length > MAX_ENTRIES) {
    const evicted = index.pop()
    if (!evicted) break
    localStorage.removeItem(storageKey(evicted))
  }

  writePollDraftIndex(index)
}

function normalizeDraft(raw: unknown): PollDraft | null {
  if (!raw || typeof raw !== "object") return null
  const d = raw as Partial<PollDraft>
  if (typeof d.question !== "string") return null
  if (!Array.isArray(d.options) || d.options.length < 2) return null
  if (!d.options.every((o) => typeof o === "string")) return null
  if (typeof d.hideRunningTotal !== "boolean") return null
  return {
    question: d.question,
    options: [...d.options],
    hideRunningTotal: d.hideRunningTotal,
  }
}

export function getPollDraft(roomId: string): PollDraft | null {
  try {
    const raw = localStorage.getItem(storageKey(roomId))
    if (!raw) return null
    return normalizeDraft(JSON.parse(raw))
  } catch {
    return null
  }
}

export function setPollDraft(roomId: string, draft: PollDraft) {
  const isEmpty =
    !draft.question.trim() &&
    draft.options.every((o) => !o.trim()) &&
    !draft.hideRunningTotal

  if (isEmpty) {
    clearPollDraft(roomId)
    return
  }

  localStorage.setItem(storageKey(roomId), JSON.stringify(draft))
  touchIndex(roomId)
}

export function clearPollDraft(roomId: string) {
  localStorage.removeItem(storageKey(roomId))
  writePollDraftIndex(readPollDraftIndex().filter((k) => k !== roomId))
}
