import type { InventoryItem, TourPunch } from "@repo/types"
import {
  TOUR_LAMINATE_PUNCH_COUNT_KEY,
  TOUR_LAMINATE_PUNCH_HISTORY_LIMIT,
  TOUR_LAMINATE_PUNCHES_KEY,
} from "@repo/types"

/** Escalating coin ladder; flat at the last rung from punch 6. */
export const TOUR_PUNCH_COIN_LADDER = [5, 10, 20, 35, 55, 80] as const

/** Shows are monthly; a gap larger than this breaks the displayed streak. */
export const TOUR_STREAK_MAX_GAP_MS = 45 * 24 * 60 * 60 * 1000

export function coinsForPunchNumber(n: number): number {
  if (n < 1) return TOUR_PUNCH_COIN_LADDER[0]
  const idx = Math.min(n, TOUR_PUNCH_COIN_LADDER.length) - 1
  return TOUR_PUNCH_COIN_LADDER[idx]!
}

function isTourPunch(value: unknown): value is TourPunch {
  if (value == null || typeof value !== "object") return false
  const p = value as Record<string, unknown>
  return (
    typeof p.key === "string" &&
    p.key.length > 0 &&
    typeof p.at === "number" &&
    Number.isFinite(p.at) &&
    typeof p.coins === "number" &&
    Number.isFinite(p.coins)
  )
}

export function readTourPunches(item: Pick<InventoryItem, "metadata"> | { metadata?: Record<string, unknown> }): TourPunch[] {
  const raw = item.metadata?.[TOUR_LAMINATE_PUNCHES_KEY]
  if (!Array.isArray(raw)) return []
  return raw.filter(isTourPunch)
}

export function readTourPunchCount(
  item: Pick<InventoryItem, "metadata"> | { metadata?: Record<string, unknown> },
): number {
  const raw = item.metadata?.[TOUR_LAMINATE_PUNCH_COUNT_KEY]
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return 0
  return Math.floor(raw)
}

export function tourPunchKey(
  showId?: string | null,
  sessionId?: string | null,
): string | null {
  const show = showId?.trim()
  if (show) return `show:${show}`
  const session = sessionId?.trim()
  if (session) return `session:${session}`
  return null
}

export function currentTourStreak(punches: readonly TourPunch[]): number {
  if (punches.length === 0) return 0
  const ordered = [...punches].sort((a, b) => a.at - b.at)
  let streak = 1
  for (let i = ordered.length - 1; i > 0; i--) {
    const gap = ordered[i]!.at - ordered[i - 1]!.at
    if (gap > TOUR_STREAK_MAX_GAP_MS) break
    streak += 1
  }
  return streak
}

export type PlanTourPunchInput = {
  existing: readonly TourPunch[]
  existingCount: number
  showId?: string | null
  sessionId?: string | null
  at: number
  label?: string
  holderUserId?: string
  holderUsername?: string
}

export type PlanTourPunchResult = {
  punch: TourPunch
  coins: number
  nextHistory: TourPunch[]
  nextCount: number
}

export function planTourPunch(input: PlanTourPunchInput): PlanTourPunchResult | null {
  const key = tourPunchKey(input.showId, input.sessionId)
  if (!key) return null

  const showId = input.showId?.trim() || undefined
  const sessionId = input.sessionId?.trim() || undefined

  const already = input.existing.some((p) => {
    if (p.key === key) return true
    if (showId && p.showId === showId) return true
    if (sessionId && p.sessionId === sessionId) return true
    return false
  })
  if (already) return null

  const nextCount = Math.max(0, Math.floor(input.existingCount)) + 1
  const coins = coinsForPunchNumber(nextCount)
  const punch: TourPunch = {
    key,
    at: input.at,
    coins,
    ...(showId ? { showId } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(input.label?.trim() ? { label: input.label.trim() } : {}),
    ...(input.holderUserId?.trim() ? { holderUserId: input.holderUserId.trim() } : {}),
    ...(input.holderUsername?.trim() ? { holderUsername: input.holderUsername.trim() } : {}),
  }

  const nextHistory = [...input.existing, punch]
  if (nextHistory.length > TOUR_LAMINATE_PUNCH_HISTORY_LIMIT) {
    nextHistory.splice(0, nextHistory.length - TOUR_LAMINATE_PUNCH_HISTORY_LIMIT)
  }

  return { punch, coins, nextHistory, nextCount }
}

export type PunchCountNoun = {
  singular: string
  plural: string
}

/** User-facing default for punch-card ledgers. Storage keys stay `tourPunches`. */
export const DEFAULT_PUNCH_COUNT_NOUN: PunchCountNoun = {
  singular: "show",
  plural: "shows",
}

export function resolvePunchCountNoun(
  detailView?: { countNoun?: { singular?: string; plural?: string } } | null,
): PunchCountNoun {
  const singular = detailView?.countNoun?.singular?.trim()
  const plural = detailView?.countNoun?.plural?.trim()
  if (singular && plural) return { singular, plural }
  return DEFAULT_PUNCH_COUNT_NOUN
}

export function formatPunchCount(count: number, noun: PunchCountNoun): string {
  if (count <= 0) return `No ${noun.plural}`
  if (count === 1) return `1 ${noun.singular}`
  return `${count} ${noun.plural}`
}
