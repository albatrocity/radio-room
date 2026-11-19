import type { AppContext } from "@repo/types"

const USER_PAUSE_KEY = (roomId: string) => `room:${roomId}:userPause`
/** Keep a pause long enough for a long admin break; cleared on resume/play. */
const USER_PAUSE_TTL_SEC = 60 * 60 * 6

export type UserPauseRecord = {
  trackId: string | null
  progressMs: number | null
  durationMs: number | null
  pausedAt: number
}

/**
 * Record that an admin paused show music. Toggle-play and the bridge advance
 * job treat this as "resume the source" until the track is confirmed finished
 * or a new play starts (ADR 0211).
 */
export async function setUserPause(params: {
  context: AppContext
  roomId: string
  record: Omit<UserPauseRecord, "pausedAt"> & { pausedAt?: number }
}): Promise<void> {
  const { context, roomId, record } = params
  const payload: UserPauseRecord = {
    trackId: record.trackId ?? null,
    progressMs: record.progressMs ?? null,
    durationMs: record.durationMs ?? null,
    pausedAt: record.pausedAt ?? Date.now(),
  }
  try {
    await context.redis.pubClient.set(USER_PAUSE_KEY(roomId), JSON.stringify(payload), {
      EX: USER_PAUSE_TTL_SEC,
    })
  } catch (error) {
    console.error(`[userPause] set failed for ${roomId}:`, error)
  }
}

export async function getUserPause(params: {
  context: AppContext
  roomId: string
}): Promise<UserPauseRecord | null> {
  const { context, roomId } = params
  try {
    const raw = await context.redis.pubClient.get(USER_PAUSE_KEY(roomId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as UserPauseRecord
    if (!parsed || typeof parsed.pausedAt !== "number") return null
    return {
      trackId: parsed.trackId ?? null,
      progressMs: typeof parsed.progressMs === "number" ? parsed.progressMs : null,
      durationMs: typeof parsed.durationMs === "number" ? parsed.durationMs : null,
      pausedAt: parsed.pausedAt,
    }
  } catch (error) {
    console.error(`[userPause] get failed for ${roomId}:`, error)
    return null
  }
}

export async function clearUserPause(params: {
  context: AppContext
  roomId: string
}): Promise<void> {
  const { context, roomId } = params
  try {
    await context.redis.pubClient.del(USER_PAUSE_KEY(roomId))
  } catch (error) {
    console.error(`[userPause] clear failed for ${roomId}:`, error)
  }
}
