import type { AppContext } from "@repo/types"

/**
 * Redis key for the last-emitted playback volume per room.
 * Used for deduplication — trackAdvanceJob polls every second.
 */
const PLAYBACK_VOLUME_KEY = (roomId: string) => `room:${roomId}:playbackVolume`

/** Minimum delta (0-100) before emitting a volume change event. */
export const PLAYBACK_VOLUME_CHANGE_THRESHOLD = 2

export interface HandlePlaybackVolumeChangeParams {
  context: AppContext
  roomId: string
  volumePercent: number
}

/**
 * Emit SYSTEM:PLAYBACK_VOLUME_CHANGED with Redis-backed deduplication.
 *
 * @returns Whether an event was emitted (false = duplicate or below threshold)
 */
export async function handlePlaybackVolumeChange(
  params: HandlePlaybackVolumeChangeParams,
): Promise<{ emitted: boolean }> {
  const { context, roomId, volumePercent } = params

  if (!context.systemEvents) {
    console.warn("[handlePlaybackVolumeChange] systemEvents not available")
    return { emitted: false }
  }

  const clamped = Math.round(Math.max(0, Math.min(100, volumePercent)))
  const key = PLAYBACK_VOLUME_KEY(roomId)
  const previous = await context.redis.pubClient.get(key)

  if (
    previous !== null &&
    Math.abs(Number(previous) - clamped) < PLAYBACK_VOLUME_CHANGE_THRESHOLD
  ) {
    return { emitted: false }
  }

  await context.redis.pubClient.set(key, String(clamped))

  await context.systemEvents.emit(roomId, "PLAYBACK_VOLUME_CHANGED", {
    roomId,
    volumePercent: clamped,
  })

  return { emitted: true }
}
