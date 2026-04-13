import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"

export type MentionUser = { id: string; display: string }

/**
 * If cursor is inside an @mention segment (from @ to cursor), returns range + query.
 * Query may include spaces for multi-word display names. Line breaks end the segment.
 * @ must be at start of text or after whitespace to avoid matching emails.
 */
export function findActiveMention(
  text: string,
  cursor: number,
): { start: number; query: string } | null {
  if (cursor < 0 || cursor > text.length) return null
  const before = text.slice(0, cursor)
  const lastAt = before.lastIndexOf("@")
  if (lastAt === -1) return null
  if (lastAt > 0) {
    const prev = text[lastAt - 1]
    if (prev && !/\s/.test(prev)) return null
  }
  const query = text.slice(lastAt + 1, cursor)
  if (/[\n\r]/.test(query)) return null
  return { start: lastAt, query }
}

const EMPTY_MENTION_USERS: MentionUser[] = []

function filterUsers(users: MentionUser[], query: string): MentionUser[] {
  const q = query.trimStart().toLowerCase()
  return users.filter((u) => (u.display ?? "").trim().toLowerCase().startsWith(q))
}

export function useMentionTrigger({
  value,
  onValueChange,
  cursor,
  onCursorChange,
  users,
  textareaRef,
  recordPick,
}: {
  value: string
  onValueChange: (next: string) => void
  cursor: number
  onCursorChange: (pos: number) => void
  users: MentionUser[]
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  /** Called when a user is chosen (overlay, keyboard, or auto-complete); register id before text updates. */
  recordPick: (user: MentionUser) => void
}) {
  /** After Escape, suppress overlay until cursor leaves this @-segment or text changes */
  const suppressedMentionStartRef = useRef<number | null>(null)

  const rawMention = useMemo(() => findActiveMention(value, cursor), [value, cursor])

  const active = useMemo(() => {
    if (!rawMention) return null
    const sup = suppressedMentionStartRef.current
    if (sup != null && rawMention.start === sup) return null
    return rawMention
  }, [rawMention])

  const filteredUsers = useMemo(
    () => (active ? filterUsers(users, active.query) : EMPTY_MENTION_USERS),
    [active, users],
  )

  const isActive = active !== null && filteredUsers.length > 0

  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const pendingSelectionRef = useRef<number | null>(null)

  useEffect(() => {
    if (!rawMention) {
      suppressedMentionStartRef.current = null
    }
  }, [rawMention])

  useEffect(() => {
    setHighlightedIndex(0)
  }, [active?.start, active?.query, filteredUsers.length])

  useLayoutEffect(() => {
    const pos = pendingSelectionRef.current
    if (pos == null) return
    pendingSelectionRef.current = null
    const el = textareaRef.current
    if (el) {
      el.setSelectionRange(pos, pos)
    }
    onCursorChange(pos)
  }, [value, textareaRef, onCursorChange])

  const selectUser = useCallback(
    (user: MentionUser) => {
      if (!active) return
      recordPick(user)
      const display = user.display.trim()
      const insert = `@${display} `
      const newValue = value.slice(0, active.start) + insert + value.slice(cursor)
      const nextCursor = active.start + insert.length
      suppressedMentionStartRef.current = null
      pendingSelectionRef.current = nextCursor
      onValueChange(newValue)
    },
    [active, cursor, onValueChange, recordPick, value],
  )

  /** Avoid duplicate auto-select in React Strict Mode (effect runs twice with same inputs). */
  const autoSelectAppliedForAtRef = useRef<number | null>(null)

  useEffect(() => {
    if (!active) {
      autoSelectAppliedForAtRef.current = null
      return
    }
    if (filteredUsers.length !== 1) return
    const u = filteredUsers[0]
    if (!u) return
    const q = active.query.trimStart().trim().toLowerCase()
    const d = u.display.trim().toLowerCase()
    if (q !== d) return
    if (autoSelectAppliedForAtRef.current === active.start) return
    autoSelectAppliedForAtRef.current = active.start
    selectUser(u)
  }, [active, filteredUsers, selectUser])

  const dismiss = useCallback(() => {
    if (rawMention) {
      suppressedMentionStartRef.current = rawMention.start
    }
  }, [rawMention])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!isActive) return

      if (e.key === "ArrowDown") {
        e.preventDefault()
        setHighlightedIndex((i) => (i + 1) % filteredUsers.length)
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setHighlightedIndex((i) => (i - 1 + filteredUsers.length) % filteredUsers.length)
        return
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        const user = filteredUsers[highlightedIndex]
        if (user) selectUser(user)
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        dismiss()
        return
      }
      if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault()
        const user = filteredUsers[highlightedIndex]
        if (user) selectUser(user)
      }
    },
    [dismiss, filteredUsers, highlightedIndex, isActive, selectUser],
  )

  return useMemo(
    () => ({
      isActive,
      query: active?.query ?? "",
      filteredUsers,
      highlightedIndex,
      setHighlightedIndex,
      handleKeyDown,
      selectUser,
      dismiss,
    }),
    [
      isActive,
      active?.query,
      filteredUsers,
      highlightedIndex,
      setHighlightedIndex,
      handleKeyDown,
      selectUser,
      dismiss,
    ],
  )
}
