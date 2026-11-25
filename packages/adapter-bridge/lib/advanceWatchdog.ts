import { canonicalTrackId, trackIdsEqual } from "./playbackFinish"

/** No-media polls after a commanded play are ignored until this grace elapses. */
export const PLAY_START_GRACE_MS = 8_000

export type PlayStartCommand = {
  at: number
  /** Track id that was playing / dispatched before this playTrack. */
  leftTrackId: string | null
  /** Track id we just asked the player to start. */
  dispatchedTrackId: string | null
}

const startCommands = new Map<string, PlayStartCommand>()

export function recordPlayTrackStart(
  roomId: string,
  command: Omit<PlayStartCommand, "at"> & { at?: number },
): void {
  startCommands.set(roomId, {
    at: command.at ?? Date.now(),
    leftTrackId: canonicalTrackId(command.leftTrackId),
    dispatchedTrackId: canonicalTrackId(command.dispatchedTrackId),
  })
}

export function getPlayTrackStart(roomId: string): PlayStartCommand | null {
  return startCommands.get(roomId) ?? null
}

export function clearPlayTrackStart(roomId: string): void {
  startCommands.delete(roomId)
}

/** Test helper — wipe in-process start commands between cases. */
export function resetPlayTrackStartsForTests(): void {
  startCommands.clear()
}

/**
 * Stale ENDED for the track we just left (or for any id that is not the one
 * we dispatched) must not force-advance the new play.
 */
export function shouldIgnoreEndedForPlayStart(params: {
  endedTrackId?: string | null
  start: PlayStartCommand | null
}): boolean {
  const { endedTrackId, start } = params
  if (!start) return false
  const ended = canonicalTrackId(endedTrackId)
  if (!ended) return false
  if (trackIdsEqual(ended, start.leftTrackId)) return true
  if (start.dispatchedTrackId && !trackIdsEqual(ended, start.dispatchedTrackId)) {
    return true
  }
  return false
}

/**
 * While an admin pause is recorded, the watchdog must not idle-start, stuck-skip,
 * or apply ENDED (ADR 0211).
 */
export function shouldHoldForUserPause(userPause: boolean): boolean {
  return userPause
}

/**
 * Count no-media polls only after the startup grace that follows a commanded play.
 */
export function shouldCountStuckNoMedia(params: {
  userPause: boolean
  start: PlayStartCommand | null
  now: number
  graceMs?: number
}): boolean {
  if (params.userPause) return false
  const start = params.start
  if (!start) return true
  const grace = params.graceMs ?? PLAY_START_GRACE_MS
  return params.now - start.at >= grace
}

export type PendingNowPlaying = {
  trackId: string
  title?: string
  artist?: string
  album?: string
}

const pendingNowPlaying = new Map<string, PendingNowPlaying>()

export function setPendingNowPlaying(roomId: string, pending: PendingNowPlaying): void {
  pendingNowPlaying.set(roomId, {
    ...pending,
    trackId: canonicalTrackId(pending.trackId) ?? pending.trackId,
  })
}

export function getPendingNowPlaying(roomId: string): PendingNowPlaying | null {
  return pendingNowPlaying.get(roomId) ?? null
}

export function clearPendingNowPlaying(roomId: string): void {
  pendingNowPlaying.delete(roomId)
}

/**
 * When transport reports the commanded track as playing with media, return the
 * pending meta so the caller can post now-playing once.
 */
export function takePendingNowPlayingIfPlaying(params: {
  roomId: string
  trackId?: string | null
  state?: string | null
  hasPlayableMedia: boolean
}): PendingNowPlaying | null {
  const pending = pendingNowPlaying.get(params.roomId)
  if (!pending) return null
  if (params.state !== "playing" || !params.hasPlayableMedia) return null
  if (!trackIdsEqual(pending.trackId, params.trackId)) return null
  pendingNowPlaying.delete(params.roomId)
  clearPlayTrackStart(params.roomId)
  return pending
}

/** Test helper */
export function resetPendingNowPlayingForTests(): void {
  pendingNowPlaying.clear()
}
