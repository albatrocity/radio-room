import type { AppContext } from "@repo/types"
import { randomUUID } from "crypto"

const TURN_LOCK_TTL_MS = 30_000
const TURN_LOCK_WAIT_MS = 25_000
const TURN_LOCK_POLL_MS = 40

const tails = new Map<string, Promise<void>>()

/**
 * One now-playing transition per room at a time, in this process.
 * Pollers and device posts overlap while metadata lookup is still running;
 * the second one must see the first one's committed "current" before it decides
 * the play is new.
 */
export function runNowPlayingTurn<T>(roomId: string, task: () => Promise<T>): Promise<T> {
  const previous = tails.get(roomId) ?? Promise.resolve()
  const run = previous.catch(() => undefined).then(task)
  const settled = run.then(
    () => undefined,
    () => undefined,
  )
  tails.set(roomId, settled)
  void settled.then(() => {
    if (tails.get(roomId) === settled) tails.delete(roomId)
  })
  return run
}

/**
 * Cross-process companion to {@link runNowPlayingTurn}. No-ops when the Redis
 * client cannot take a lock (unit tests). Returns null when the lock stays
 * busy until the wait expires — the caller skips the write so a stuck holder
 * cannot be joined by a second playlist row.
 */
export async function acquireNowPlayingLock(
  context: AppContext,
  roomId: string,
): Promise<(() => Promise<void>) | null> {
  const client = context.redis?.pubClient
  if (!client || typeof client.set !== "function") {
    return async () => {}
  }

  const key = `room:${roomId}:nowPlayingTurn`
  const token = randomUUID()
  const deadline = Date.now() + TURN_LOCK_WAIT_MS
  let acquired = false

  while (Date.now() < deadline) {
    const result = await client.set(key, token, { NX: true, PX: TURN_LOCK_TTL_MS })
    if (result) {
      acquired = true
      break
    }
    await delay(TURN_LOCK_POLL_MS)
  }

  if (!acquired) {
    console.warn(
      `[handleRoomNowPlayingData] now-playing turn lock busy for room ${roomId}; skipping`,
    )
    return null
  }

  return async () => {
    try {
      const holder = await client.get(key)
      if (holder === token) await client.del(key)
    } catch (error) {
      console.error(`[handleRoomNowPlayingData] failed to release now-playing lock for ${roomId}:`, error)
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
