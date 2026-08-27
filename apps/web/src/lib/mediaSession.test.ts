import { describe, expect, it, vi, beforeEach } from "vitest"
import { applyMediaSession, clearMediaSession } from "./mediaSession"

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
  })

  it("sets metadata, playback state, and play/pause handlers", () => {
    const play = vi.fn()
    const pause = vi.fn()
    applyMediaSession(
      {
        title: "Song",
        artist: "Artist",
        album: "Album",
        artworkUrl: "https://img/cover.jpg",
        playing: true,
      },
      { play, pause },
    )

    expect(session.playbackState).toBe("playing")
    expect(session.metadata?.title).toBe("Song")
    expect(setActionHandler).toHaveBeenCalledWith("play", play)
    expect(setActionHandler).toHaveBeenCalledWith("pause", pause)
  })

  it("clears handlers and metadata", () => {
    clearMediaSession()
    expect(session.metadata).toBeNull()
    expect(session.playbackState).toBe("none")
    expect(setActionHandler).toHaveBeenCalledWith("play", null)
    expect(setActionHandler).toHaveBeenCalledWith("pause", null)
  })
})
