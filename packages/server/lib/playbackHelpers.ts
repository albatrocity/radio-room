/** Match trackAdvanceJob end window — treat playback as finished at or past this point. */
export const PLAYBACK_END_THRESHOLD_MS = 1000

/** Pauses at or above this position are treated as mid-track resume, not queue advance. */
export const MID_TRACK_RESUME_MIN_MS = 1000

export type PlaybackSnapshot = {
  state: "playing" | "paused" | "stopped"
  track: unknown | null
  progressMs?: number | null
  durationMs?: number | null
  /** When false, transport could not be read (ADR 0112). */
  observed?: boolean
}

export type UserPauseSnapshot = {
  trackId?: string | null
  progressMs?: number | null
  durationMs?: number | null
}

export type ShouldAdvanceOptions = {
  /**
   * Reserved for callers without a user-pause record; mid-track detection is the
   * only resume gate. Finished tracks (including Spotify progress reset to 0)
   * always prefer the queue.
   */
  queueAutoAdvance?: boolean
  /**
   * Admin pause written before `api.pause()`. When present, Play resumes unless
   * the track is a confirmed finish (ADR 0211).
   */
  userPause?: UserPauseSnapshot | null
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

function isNearEnd(progressMs: number, durationMs: number | null | undefined): boolean {
  if (durationMs == null || durationMs <= 0) return false
  return progressMs >= durationMs - PLAYBACK_END_THRESHOLD_MS
}

function isApproachingEnd(progressMs: number, durationMs: number | null | undefined): boolean {
  if (durationMs == null || durationMs <= 0) return false
  const window = Math.min(15_000, Math.floor(durationMs * 0.5))
  return progressMs >= durationMs - window
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
 * A user pause is a confirmed finish only when the live snapshot (or the stored
 * pause position) shows the track ended — not when the SDK returns a blank read.
 */
export function isConfirmedFinishAfterUserPause(
  playback: PlaybackSnapshot,
  userPause: UserPauseSnapshot,
): boolean {
  const liveProgress = playback.progressMs
  const liveDuration = playback.durationMs ?? userPause.durationMs ?? null

  if (typeof liveProgress === "number" && isNearEnd(liveProgress, liveDuration)) {
    return true
  }

  const storedProgress = userPause.progressMs
  const storedDuration = userPause.durationMs ?? liveDuration
  if (
    typeof storedProgress === "number" &&
    isApproachingEnd(storedProgress, storedDuration) &&
    (liveProgress == null || liveProgress < MID_TRACK_RESUME_MIN_MS)
  ) {
    return true
  }

  return false
}

/**
 * When playback is not playing, decide whether Play should start the next queue item
 * instead of resuming the current controller track.
 *
 * With a user-pause record (ADR 0211): resume unless the track is a confirmed finish.
 * A missing position, null SDK read, or `observed: false` still resumes.
 *
 * Without a user-pause record: resume only when clearly paused mid-track. Otherwise
 * advance — including when Spotify keeps the prior item with `progress_ms` reset to 0
 * after a natural end, or when a bridge source is idle/unplayable.
 */
export function shouldAdvanceToNextQueueItem(
  playback: PlaybackSnapshot,
  queue: { locked?: boolean }[],
  options: ShouldAdvanceOptions = {},
): boolean {
  if (playback.state === "playing" || queue.length === 0) {
    return false
  }

  if (options.userPause) {
    return isConfirmedFinishAfterUserPause(playback, options.userPause)
  }

  if (canResumeCurrentTrack(playback)) {
    return false
  }

  return true
}
