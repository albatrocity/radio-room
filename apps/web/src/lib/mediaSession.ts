type MediaSessionHandlers = {
  play: () => void
  pause: () => void
}

export type MediaSessionMetadata = {
  title: string
  artist?: string
  album?: string
  artworkUrl?: string | null
  playing: boolean
}

function getSession(): MediaSession | null {
  if (typeof navigator === "undefined") return null
  return navigator.mediaSession ?? null
}

export function applyMediaSession(
  meta: MediaSessionMetadata,
  handlers: MediaSessionHandlers,
): void {
  const session = getSession()
  if (!session) return

  try {
    session.metadata = new MediaMetadata({
      title: meta.title,
      artist: meta.artist ?? "",
      album: meta.album ?? "",
      artwork: meta.artworkUrl
        ? [{ src: meta.artworkUrl, sizes: "512x512" }]
        : [],
    })
    session.playbackState = meta.playing ? "playing" : "paused"
    session.setActionHandler("play", handlers.play)
    session.setActionHandler("pause", handlers.pause)
  } catch {
    /* Media Session is best-effort (unsupported metadata fields, insecure context). */
  }
}

export function clearMediaSession(): void {
  const session = getSession()
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
