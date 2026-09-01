/**
 * OS lock screen / Control Center metadata.
 *
 * Metadata is applied separately from playback state and action handlers, and
 * skipped entirely when nothing changed. Replacing `MediaMetadata` makes the OS
 * re-fetch artwork, so rebuilding it on every room meta tick means the image
 * never finishes loading — text appears, the cover stays blank.
 */

type MediaSessionHandlers = {
  play: () => void
  pause: () => void
}

export type MediaSessionMetadata = {
  title: string
  artist?: string
  album?: string
  artwork?: MediaImage[]
}

let lastSignature: string | null = null
let applyCount = 0

function getSession(): MediaSession | null {
  if (typeof navigator === "undefined") return null
  return navigator.mediaSession ?? null
}

function signatureOf(meta: MediaSessionMetadata): string {
  return JSON.stringify([
    meta.title,
    meta.artist ?? "",
    meta.album ?? "",
    (meta.artwork ?? []).map((image) => image.src),
  ])
}

export function applyMediaSessionMetadata(meta: MediaSessionMetadata): void {
  const session = getSession()
  if (!session) return

  const signature = signatureOf(meta)
  if (signature === lastSignature) return

  try {
    session.metadata = new MediaMetadata({
      title: meta.title,
      artist: meta.artist ?? "",
      album: meta.album ?? "",
      artwork: meta.artwork ?? [],
    })
    lastSignature = signature
    applyCount += 1
  } catch {
    /* Media Session is best-effort (unsupported fields, insecure context). */
  }
}

export function setMediaSessionPlaybackState(playing: boolean): void {
  const session = getSession()
  if (!session) return
  try {
    session.playbackState = playing ? "playing" : "paused"
  } catch {
    /* ignore */
  }
}

export function setMediaSessionHandlers(handlers: MediaSessionHandlers): void {
  const session = getSession()
  if (!session) return
  try {
    session.setActionHandler("play", handlers.play)
    session.setActionHandler("pause", handlers.pause)
  } catch {
    /* ignore */
  }
}

export function clearMediaSession(): void {
  const session = getSession()
  lastSignature = null
  if (!session) return
  try {
    session.metadata = null
    session.playbackState = "none"
    session.setActionHandler("play", null)
    session.setActionHandler("pause", null)
  } catch {
    /* ignore */
  }
}

export type MediaSessionDebug = {
  supported: boolean
  /** How many times MediaMetadata was actually rebuilt. */
  applyCount: number
  title: string | null
  artwork: string[]
}

/** Console diagnostics: `window.__mediaSessionDebug?.()` in a room. */
export function getMediaSessionDebug(): MediaSessionDebug {
  const session = getSession()
  const metadata = session?.metadata ?? null
  return {
    supported: Boolean(session),
    applyCount,
    title: metadata?.title ?? null,
    artwork: metadata ? Array.from(metadata.artwork ?? []).map((image) => image.src) : [],
  }
}
