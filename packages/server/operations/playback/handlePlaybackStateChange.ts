import type { AppContext } from "@repo/types"

/**
 * Redis key for the last-emitted playback state per room.
 * Used for deduplication — the Spotify adapter fires both onPause and
 * onPlaybackStateChange("paused") on a single pause action.
 */
const PLAYBACK_STATE_KEY = (roomId: string) => `room:${roomId}:playbackState`

export type PlaybackState = "playing" | "paused" | "stopped"

export interface HandlePlaybackStateChangeParams {
  context: AppContext
  roomId: string
  state: PlaybackState
  trackId?: string | null
}

/**
 * Emit SYSTEM:PLAYBACK_STATE_CHANGED with Redis-backed deduplication.
 *
 * This operation stores the last-emitted state in Redis and only emits
 * when the state transitions. This is essential because:
 * 1. Spotify adapter fires both onPause AND onPlaybackStateChange("paused") on pause
 * 2. trackAdvanceJob polls every second and would spam events otherwise
 *
 * @returns Whether an event was emitted (false = duplicate, suppressed)
 */
export async function handlePlaybackStateChange(
  params: HandlePlaybackStateChangeParams,
): Promise<{ emitted: boolean }> {
  const { context, roomId, state, trackId = null } = params

  if (!context.systemEvents) {
    console.warn("[handlePlaybackStateChange] systemEvents not available")
    return { emitted: false }
  }

  const key = PLAYBACK_STATE_KEY(roomId)
  const previous = await context.redis.pubClient.get(key)

  if (previous === state) {
    return { emitted: false }
  }

  await context.redis.pubClient.set(key, state)

  await context.systemEvents.emit(roomId, "PLAYBACK_STATE_CHANGED", {
    roomId,
    state,
    trackId,
  })

  return { emitted: true }
}

/**
 * Helper to convert Spotify's is_playing boolean to our state enum.
 */
export function playbackStateFromIsPlaying(isPlaying: boolean): PlaybackState {
  return isPlaying ? "playing" : "paused"
}
