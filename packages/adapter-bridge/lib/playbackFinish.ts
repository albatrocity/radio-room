/** Advance only when this much (or less) of the track remains. */
export const ADVANCE_THRESHOLD_MS = 1000
/** Widen probe cadence / treat idle-after-this as a likely natural finish. */
export const NEAR_END_WINDOW_MS = 15_000
/** Spotify often reports paused at 0 after a natural end — treat below this as "reset". */
export const PROGRESS_RESET_MAX_MS = 1000
/**
 * A track shorter than twice a window sits inside that window from its very first
 * pulse, so SDK loading snapshots (tiny duration, progress 0) would read as "near
 * end". Clamping every end window to half the duration keeps the tests meaningful
 * for genuinely short tracks; a blanket minimum duration instead leaves anything
 * shorter with no end detection at all.
 */
export const MAX_END_WINDOW_FRACTION = 0.5

function endWindowMs(durationMs: number, windowMs: number): number {
  return Math.min(windowMs, Math.floor(durationMs * MAX_END_WINDOW_FRACTION))
}

/** Strip `spotify:track:` so queue ids and SDK ids compare equal. */
export function canonicalTrackId(id: string | null | undefined): string | null {
  if (!id) return null
  const trimmed = id.trim()
  const prefix = "spotify:track:"
  return trimmed.startsWith(prefix) ? trimmed.slice(prefix.length) : trimmed
}

export function trackIdsEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const ca = canonicalTrackId(a)
  const cb = canonicalTrackId(b)
  if (!ca || !cb) return false
  return ca === cb
}

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
    durationMs > 0 &&
    progressMs >= durationMs - endWindowMs(durationMs, ADVANCE_THRESHOLD_MS)
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
    progressMs >= durationMs - endWindowMs(durationMs, NEAR_END_WINDOW_MS)
  )
}

function sameTrack(
  current: TransportSnapshot,
  previous: TransportSnapshot | null,
): boolean {
  if (!current.trackId || !previous?.trackId) return true
  return trackIdsEqual(current.trackId, previous.trackId)
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
  if (currentTrackId && lastState.trackId && !trackIdsEqual(lastState.trackId, currentTrackId)) {
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

/**
 * The daemon confirms a natural end shortly *after* our own near-end probe has already
 * advanced, so an end signal generated within this window of the last advance describes
 * the track we just left rather than the one that started.
 */
export const END_SIGNAL_GRACE_MS = 3000
/**
 * The durable `last_ended` key can be read long after it was written (the 1s job is
 * serialized behind a slow getPlayback RPC), by which time it says nothing about the
 * current track.
 */
export const END_SIGNAL_MAX_AGE_MS = 30_000

/**
 * True when an end signal cannot describe the currently playing track, because it was
 * generated before we last advanced or is simply too old to trust. This is the guard
 * that keeps a late signal from skipping the track it caused us to start.
 */
export function endSignalIsSpent(params: {
  at: number | null | undefined
  lastAdvanceAt: number
  now: number
  /** Clamps the grace window so a track shorter than it can still end. */
  trackDurationMs?: number | null
  graceMs?: number
  maxAgeMs?: number
}): boolean {
  const { at, lastAdvanceAt, now, trackDurationMs } = params
  if (at == null) return false
  if (now - at > (params.maxAgeMs ?? END_SIGNAL_MAX_AGE_MS)) return true
  if (lastAdvanceAt <= 0) return false
  const grace =
    params.graceMs ??
    (trackDurationMs != null && trackDurationMs > 0
      ? endWindowMs(trackDurationMs, END_SIGNAL_GRACE_MS)
      : END_SIGNAL_GRACE_MS)
  return at <= lastAdvanceAt + grace
}

/**
 * Late ENDED for a URI we already advanced past must not skip the track that just
 * started. Only that case is stale: an unknown, relinked, or unrecognised id has to
 * stay actionable, otherwise a single id mismatch stalls auto-advance indefinitely.
 */
export function endedTrackIsStale(
  endedTrackId: string | null | undefined,
  currentTrackId: string | null | undefined,
  advancedPastTrackIds: Iterable<string>,
): boolean {
  const ended = canonicalTrackId(endedTrackId)
  if (!ended) return false
  if (trackIdsEqual(ended, currentTrackId)) return false
  for (const past of advancedPastTrackIds) {
    if (trackIdsEqual(ended, past)) return true
  }
  return false
}
