/**
 * Per-user poll card display mode (expanded / collapsed / hidden).
 *
 * Values: `radioroom:poll-display:{roomId}:{pollId}`
 * LRU index: `radioroom:poll-display:index` (JSON array of `"roomId:pollId"` keys)
 *
 * Concurrent writes from two tabs in the same room can clobber the index —
 * eventual consistency is acceptable for a UX preference.
 */

export type PollDisplayMode = "expanded" | "collapsed" | "hidden"

const PREFIX = "radioroom:poll-display"
const INDEX_KEY = `${PREFIX}:index`
const MAX_ENTRIES = 100

function storageKey(roomId: string, pollId: string) {
  return `${PREFIX}:${roomId}:${pollId}`
}

function indexEntry(roomId: string, pollId: string) {
  return `${roomId}:${pollId}`
}

export function readPollDisplayIndex(): string[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((k) => typeof k === "string") : []
  } catch {
    return []
  }
}

export function writePollDisplayIndex(index: string[]) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(index))
}

function touchIndex(entry: string) {
  const index = readPollDisplayIndex().filter((k) => k !== entry)
  index.unshift(entry)

  while (index.length > MAX_ENTRIES) {
    const evicted = index.pop()
    if (!evicted) break
    const sep = evicted.indexOf(":")
    if (sep === -1) continue
    const roomId = evicted.slice(0, sep)
    const pollId = evicted.slice(sep + 1)
    localStorage.removeItem(storageKey(roomId, pollId))
  }

  writePollDisplayIndex(index)
}

export function getPollDisplayMode(roomId: string, pollId: string): PollDisplayMode {
  const raw = localStorage.getItem(storageKey(roomId, pollId))
  if (raw === "collapsed" || raw === "hidden") return raw
  return "expanded"
}

export function setPollDisplayMode(roomId: string, pollId: string, mode: PollDisplayMode) {
  const entry = indexEntry(roomId, pollId)
  if (mode === "expanded") {
    localStorage.removeItem(storageKey(roomId, pollId))
    writePollDisplayIndex(readPollDisplayIndex().filter((k) => k !== entry))
    return
  }
  localStorage.setItem(storageKey(roomId, pollId), mode)
  touchIndex(entry)
}
