/** Advance only when this much (or less) of the track remains. */
export const ADVANCE_THRESHOLD_MS = 1000
/** Widen probe cadence / treat idle-after-this as a likely natural finish. */
export const NEAR_END_WINDOW_MS = 15_000
/** Spotify often reports paused at 0 after a natural end — treat below this as "reset". */
export const PROGRESS_RESET_MAX_MS = 1000
/**
 * SDK loading snapshots can report a tiny duration with progress 0, which would
 * otherwise look like "near end" (`progress >= duration - 1s`).
 */
export const MIN_NEAR_END_DURATION_MS = 10_000

export type TransportSnapshot = {
  state: "playing" | "paused" | "stopped"
  progressMs: number | null | undefined
  durationMs: number | null | undefined
  trackId?: string | null
}

export function isNearEnd(
  progressMs: number | null | undefined,
  durationMs: number | null | undefined,
) {
  return (
    progressMs != null &&
    durationMs != null &&
    durationMs >= MIN_NEAR_END_DURATION_MS &&
    progressMs >= durationMs - ADVANCE_THRESHOLD_MS
  )
}

export function isApproachingEnd(
  progressMs: number | null | undefined,
  durationMs: number | null | undefined,
) {
  return (
    progressMs != null &&
    durationMs != null &&
    durationMs >= MIN_NEAR_END_DURATION_MS &&
    progressMs >= durationMs - NEAR_END_WINDOW_MS
  )
}

function sameTrack(
  current: TransportSnapshot,
  previous: TransportSnapshot | null,
): boolean {
  if (!current.trackId || !previous?.trackId) return true
  return current.trackId === previous.trackId
}

/**
 * True when transport looks like a finished track (not a mid-track user pause).
 * `previous` is the last healthy playing snapshot, used for Spotify's
 * paused-at-0 / getCurrentState-null end behavior.
 *
 * Snapshots from a different `trackId` than `previous` are ignored — the Spotify
 * SDK often replays the prior track's end event after the next URI has started.
 */
export function isNaturalFinish(
  current: TransportSnapshot,
  previous: TransportSnapshot | null,
): boolean {
  if (!sameTrack(current, previous)) {
    return false
  }
  if (isNearEnd(current.progressMs, current.durationMs)) {
    return true
  }
  if (current.state === "playing") {
    return false
  }
  if (!previous) {
    return false
  }
  if (isNearEnd(previous.progressMs, previous.durationMs)) {
    return true
  }
  const progress = current.progressMs
  const resetOrGone = progress == null || progress < PROGRESS_RESET_MAX_MS
  return resetOrGone && isApproachingEnd(previous.progressMs, previous.durationMs)
}

/** Ignore STATE from a driver that is not the room's active source (cross-source stale pulse). */
export function lastStateShouldAdvance(
  lastState: { source: string; trackId?: string | null } & TransportSnapshot,
  activeSource: string | null,
  currentTrackId?: string | null,
): boolean {
  if (!activeSource || lastState.source !== activeSource) {
    return false
  }
  if (currentTrackId && lastState.trackId && lastState.trackId !== currentTrackId) {
    return false
  }
  return isNearEnd(lastState.progressMs, lastState.durationMs)
}

export function endedSourceMatchesActive(
  endedSource: string | undefined,
  activeSource: string | null,
): boolean {
  if (!endedSource || !activeSource) return true
  return endedSource === activeSource
}

/** Late ENDED for the previous Spotify URI must not skip the track that just started. */
export function endedTrackMatchesCurrent(
  endedTrackId: string | undefined,
  currentTrackId: string | null,
): boolean {
  if (!endedTrackId || !currentTrackId) return true
  return endedTrackId === currentTrackId
}
