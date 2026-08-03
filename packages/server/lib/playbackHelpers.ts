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
  /**
   * Reserved for callers; mid-track detection is the only resume gate.
   * Finished tracks (including Spotify progress reset to 0) always prefer the queue.
   */
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

/**
 * True when the controller still has a mid-track position that Play should resume
 * (vs starting the next queue item / staying idle).
 */
export function canResumeCurrentTrack(playback: PlaybackSnapshot): boolean {
  if (playback.state === "playing") {
    return true
  }
  return isMidTrackPause(playback.progressMs ?? 0, playback.durationMs)
}

/**
 * When playback is not playing, decide whether Play should start the next queue item
 * instead of resuming the current controller track.
 *
 * Resume only when clearly paused mid-track. Otherwise advance — including when Spotify
 * keeps the prior item with `progress_ms` reset to 0 after a natural end, or when a
 * bridge source is idle/unplayable (stub track, no duration).
 */
export function shouldAdvanceToNextQueueItem(
  playback: PlaybackSnapshot,
  queue: { locked?: boolean }[],
  _options: ShouldAdvanceOptions = {},
): boolean {
  if (playback.state === "playing" || queue.length === 0) {
    return false
  }

  if (canResumeCurrentTrack(playback)) {
    return false
  }

  return true
}
