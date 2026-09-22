import type { AppContext } from "@repo/types"
import { claimDueMembers } from "./claimDueMembers"

/**
 * Global ZSET of timed modifiers: score = endAt, member =
 * `${roomId}:${sessionId}:${userId}:${modifierId}` (ADR 0191).
 */
export const GAME_MODIFIERS_EXPIRING_KEY = "game:modifiers:expiring"

export type ModifierExpiryRecord = {
  roomId: string
  sessionId: string
  userId: string
  modifierId: string
}

export function modifierExpiryMember(
  roomId: string,
  sessionId: string,
  userId: string,
  modifierId: string,
): string {
  return `${roomId}:${sessionId}:${userId}:${modifierId}`
}

export function parseModifierExpiryMember(member: string): ModifierExpiryRecord | null {
  const first = member.indexOf(":")
  if (first <= 0) return null
  const second = member.indexOf(":", first + 1)
  if (second <= first + 1) return null
  const third = member.indexOf(":", second + 1)
  if (third <= second + 1) return null

  const roomId = member.slice(0, first)
  const sessionId = member.slice(first + 1, second)
  const userId = member.slice(second + 1, third)
  const modifierId = member.slice(third + 1)
  if (!roomId || !sessionId || !userId || !modifierId) return null
  return { roomId, sessionId, userId, modifierId }
}

/** Upsert a modifier into the expiry ZSET (score = endAt). */
export async function scheduleModifierExpiry({
  context,
  roomId,
  sessionId,
  userId,
  modifierId,
  endAt,
}: {
  context: AppContext
  roomId: string
  sessionId: string
  userId: string
  modifierId: string
  endAt: number
}): Promise<void> {
  await context.redis.pubClient.zAdd(GAME_MODIFIERS_EXPIRING_KEY, {
    score: endAt,
    value: modifierExpiryMember(roomId, sessionId, userId, modifierId),
  })
}

/** Remove a modifier from the expiry ZSET (manual remove / replace / stack eviction). */
export async function cancelModifierExpiry({
  context,
  roomId,
  sessionId,
  userId,
  modifierId,
}: {
  context: AppContext
  roomId: string
  sessionId: string
  userId: string
  modifierId: string
}): Promise<boolean> {
  const removed = await context.redis.pubClient.zRem(
    GAME_MODIFIERS_EXPIRING_KEY,
    modifierExpiryMember(roomId, sessionId, userId, modifierId),
  )
  return removed === 1
}

/**
 * Claim due modifier expiries. Empty set short-circuits with ZCOUNT;
 * non-empty claims via shared Lua so multi-dyno ZREM races stay one RTT.
 */
export async function claimDueModifierExpiries({
  context,
  now = Date.now(),
}: {
  context: AppContext
  now?: number
}): Promise<ModifierExpiryRecord[]> {
  const raw = await claimDueMembers({ context, key: GAME_MODIFIERS_EXPIRING_KEY, now })
  const claimed: ModifierExpiryRecord[] = []
  for (const member of raw) {
    const parsed = parseModifierExpiryMember(member)
    if (parsed) claimed.push(parsed)
  }
  return claimed
}
