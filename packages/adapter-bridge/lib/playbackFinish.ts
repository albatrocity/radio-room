/** Advance only when this much (or less) of the track remains. */
export const ADVANCE_THRESHOLD_MS = 1000
/** Widen probe cadence / treat idle-after-this as a likely natural finish. */
export const NEAR_END_WINDOW_MS = 15_000
/** Spotify often reports paused at 0 after a natural end — treat below this as "reset". */
export const PROGRESS_RESET_MAX_MS = 1000

export type TransportSnapshot = {
  state: "playing" | "paused" | "stopped"
  progressMs: number | null | undefined
  durationMs: number | null | undefined
}

export function isNearEnd(
  progressMs: number | null | undefined,
  durationMs: number | null | undefined,
) {
  return (
    progressMs != null &&
    durationMs != null &&
    durationMs > 0 &&
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
    durationMs > 0 &&
    progressMs >= durationMs - NEAR_END_WINDOW_MS
  )
}

/**
 * True when transport looks like a finished track (not a mid-track user pause).
 * `previous` is the last healthy playing snapshot, used for Spotify's
 * paused-at-0 / getCurrentState-null end behavior.
 */
export function isNaturalFinish(
  current: TransportSnapshot,
  previous: TransportSnapshot | null,
): boolean {
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
  lastState: { source: string } & TransportSnapshot,
  activeSource: string | null,
): boolean {
  if (!activeSource || lastState.source !== activeSource) {
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
