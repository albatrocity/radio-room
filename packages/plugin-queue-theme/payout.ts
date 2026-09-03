import { sampleN, type ShuffleRng } from "@repo/plugin-base/helpers"

/**
 * Pure payout helpers for Queue Theme.
 */

export function computeDjPayout(params: {
  yesCount: number
  noCount: number
  coinPerNetVote: number
}): number {
  const net = Math.max(0, params.yesCount - params.noCount)
  return net * Math.max(0, params.coinPerNetVote)
}

export function tallyThemeVotes(params: {
  votes: Record<string, string>
  optionIds: { yes: string; no: string; decoy?: string }
  /** Exclude this userId from tallies (current-track DJ). */
  excludeUserId?: string | null
}): { yesCount: number; noCount: number; decoyCount: number; decoyVoterIds: string[] } {
  let yesCount = 0
  let noCount = 0
  let decoyCount = 0
  const decoyVoterIds: string[] = []

  for (const [userId, optionId] of Object.entries(params.votes)) {
    if (params.excludeUserId && userId === params.excludeUserId) continue
    if (optionId === params.optionIds.yes) {
      yesCount += 1
    } else if (optionId === params.optionIds.no) {
      noCount += 1
    } else if (params.optionIds.decoy && optionId === params.optionIds.decoy) {
      decoyCount += 1
      decoyVoterIds.push(userId)
    }
  }

  return { yesCount, noCount, decoyCount, decoyVoterIds }
}

/** Fisher–Yates sample of up to `count` ids from `pool`. */
export function sampleUserIds(
  pool: string[],
  count: number,
  rng?: ShuffleRng,
): string[] {
  return sampleN(pool, count, rng)
}

export function parseTruthyParam(value: unknown): boolean {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value !== 0
  if (typeof value !== "string") return false
  const v = value.trim().toLowerCase()
  return v === "true" || v === "1" || v === "yes"
}

export function parseNonNegInt(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value))
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number.parseInt(value.trim(), 10)
    if (Number.isFinite(n)) return Math.max(0, n)
  }
  return fallback
}
