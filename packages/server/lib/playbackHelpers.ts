/** Match trackAdvanceJob end window — treat playback as finished at or past this point. */
export const PLAYBACK_END_THRESHOLD_MS = 1000

/** Pauses at or above this position are treated as mid-track resume, not queue advance. */
export const MID_TRACK_RESUME_MIN_MS = 1000

export type PlaybackSnapshot = {
  state: "playing" | "paused" | "stopped"
  track: unknown | null
  progressMs?: number | null
  durationMs?: number | null
}

export type ShouldAdvanceOptions = {
  /** When false, Play prefers the next queue item unless clearly mid-track paused. */
  queueAutoAdvance?: boolean
}

function isMidTrackPause(progressMs: number, durationMs: number | null | undefined): boolean {
  if (durationMs == null || durationMs <= 0) {
    return false
  }
  return (
    progressMs >= MID_TRACK_RESUME_MIN_MS &&
    progressMs < durationMs - PLAYBACK_END_THRESHOLD_MS
  )
}

function isNearTrackEnd(progressMs: number, durationMs: number | null | undefined): boolean {
  if (durationMs == null || durationMs <= 0) {
    return false
  }
  return progressMs >= durationMs - PLAYBACK_END_THRESHOLD_MS
}

/**
 * When Spotify is not playing, decide whether Play should start the next queue item
 * instead of resuming the current (finished) track.
 *
 * After a natural track end Spotify often resets `progress_ms` to 0 while keeping the
 * same item — so end detection cannot rely on progress alone near the start.
 */
export function shouldAdvanceToNextQueueItem(
  playback: PlaybackSnapshot,
  queue: { locked?: boolean }[],
  options: ShouldAdvanceOptions = {},
): boolean {
  const queueAutoAdvance = options.queueAutoAdvance !== false

  if (playback.state === "playing" || queue.length === 0) {
    return false
  }

  const duration = playback.durationMs
  const progress = playback.progressMs ?? 0

  if (!playback.track) {
    // Controllers that omit track (e.g. bridge before stub) should still resume mid-stream.
    if (isMidTrackPause(progress, duration)) {
      return false
    }
    return true
  }

  if (isMidTrackPause(progress, duration)) {
    return false
  }

  if (isNearTrackEnd(progress, duration)) {
    return true
  }

  // Manual-advance mode: idle Spotify with queue items should start the next track,
  // including when the previous song ended and progress was reset to 0.
  if (!queueAutoAdvance) {
    return true
  }

  return false
}
