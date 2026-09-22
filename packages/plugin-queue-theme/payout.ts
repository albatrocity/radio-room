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

/** User ids that voted for the decoy option, optionally excluding one user (e.g. DJ). */
export function decoyVoterIds(
  votes: Record<string, string>,
  decoyOptionId: string,
  excludeUserId?: string | null,
): string[] {
  const ids: string[] = []
  for (const [userId, optionId] of Object.entries(votes)) {
    if (excludeUserId && userId === excludeUserId) continue
    if (optionId === decoyOptionId) ids.push(userId)
  }
  return ids
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
