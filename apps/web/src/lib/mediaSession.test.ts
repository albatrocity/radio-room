import { describe, expect, it, vi, beforeEach } from "vitest"
import {
  applyMediaSessionMetadata,
  clearMediaSession,
  getMediaSessionDebug,
  setMediaSessionHandlers,
  setMediaSessionPlaybackState,
} from "./mediaSession"

describe("mediaSession", () => {
  const setActionHandler = vi.fn()
  const session = {
    metadata: undefined as MediaMetadata | null | undefined,
    playbackState: "none" as MediaSessionPlaybackState,
    setActionHandler,
  }

  beforeEach(() => {
    setActionHandler.mockClear()
    class FakeMediaMetadata {
      title = ""
      artist = ""
      album = ""
      artwork: MediaImage[] = []
      constructor(init?: MediaMetadataInit) {
        Object.assign(this, init)
      }
    }
    vi.stubGlobal("MediaMetadata", FakeMediaMetadata)
    Object.defineProperty(navigator, "mediaSession", {
      configurable: true,
      value: session,
    })
    session.metadata = undefined
    session.playbackState = "none"
    clearMediaSession()
  })

  it("sets metadata, playback state, and play/pause handlers", () => {
    const play = vi.fn()
    const pause = vi.fn()
    applyMediaSessionMetadata({
      title: "Song",
      artist: "Artist",
      album: "Album",
      artwork: [{ src: "https://img/cover.jpg", sizes: "640x640" }],
    })
    setMediaSessionPlaybackState(true)
    setMediaSessionHandlers({ play, pause })

    expect(session.playbackState).toBe("playing")
    expect(session.metadata?.title).toBe("Song")
    expect(session.metadata?.artwork).toEqual([
      { src: "https://img/cover.jpg", sizes: "640x640" },
    ])
    expect(setActionHandler).toHaveBeenCalledWith("play", play)
    expect(setActionHandler).toHaveBeenCalledWith("pause", pause)
  })

  /** Rebuilding metadata restarts the OS artwork fetch — the blank-cover bug. */
  it("does not rebuild metadata when nothing changed", () => {
    const meta = {
      title: "Song",
      artist: "Artist",
      artwork: [{ src: "https://img/cover.jpg" }],
    }
    applyMediaSessionMetadata(meta)
    const first = session.metadata
    const baseline = getMediaSessionDebug().applyCount

    applyMediaSessionMetadata({ ...meta, artwork: [{ src: "https://img/cover.jpg" }] })
    expect(session.metadata).toBe(first)
    expect(getMediaSessionDebug().applyCount).toBe(baseline)
  })

  it("rebuilds when the artwork changes", () => {
    applyMediaSessionMetadata({ title: "Song", artwork: [{ src: "https://img/a.jpg" }] })
    const baseline = getMediaSessionDebug().applyCount
    applyMediaSessionMetadata({ title: "Song", artwork: [{ src: "https://img/b.jpg" }] })
    expect(getMediaSessionDebug().applyCount).toBe(baseline + 1)
    expect(getMediaSessionDebug().artwork).toEqual(["https://img/b.jpg"])
  })

  it("playback state changes do not touch metadata", () => {
    applyMediaSessionMetadata({ title: "Song", artwork: [{ src: "https://img/a.jpg" }] })
    const first = session.metadata
    const baseline = getMediaSessionDebug().applyCount
    setMediaSessionPlaybackState(false)
    setMediaSessionPlaybackState(true)
    expect(session.metadata).toBe(first)
    expect(getMediaSessionDebug().applyCount).toBe(baseline)
  })

  it("clears handlers and metadata", () => {
    clearMediaSession()
    expect(session.metadata).toBeNull()
    expect(session.playbackState).toBe("none")
    expect(setActionHandler).toHaveBeenCalledWith("play", null)
    expect(setActionHandler).toHaveBeenCalledWith("pause", null)
  })

  it("re-applies after a clear", () => {
    applyMediaSessionMetadata({ title: "Song" })
    clearMediaSession()
    applyMediaSessionMetadata({ title: "Song" })
    expect(session.metadata?.title).toBe("Song")
  })
})
