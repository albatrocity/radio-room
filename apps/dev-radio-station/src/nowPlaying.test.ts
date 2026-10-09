import { afterEach, describe, expect, it, vi } from "vitest"
import { FALLBACK_TRACKS } from "./fallbackTracks.js"
import { NowPlayingController } from "./nowPlaying.js"

describe("NowPlayingController", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("starts on the first fallback track", () => {
    const np = new NowPlayingController(0)
    expect(np.getSnapshot().title).toBe(FALLBACK_TRACKS[0]!.title)
    expect(np.getSnapshot().source).toBe("fallback")
    expect(np.getSnapshot().streamTitle).toContain("|")
  })

  it("rotates fallback tracks on an interval", () => {
    vi.useFakeTimers()
    const np = new NowPlayingController(1000)
    np.start()
    expect(np.getSnapshot().title).toBe(FALLBACK_TRACKS[0]!.title)
    vi.advanceTimersByTime(1000)
    expect(np.getSnapshot().title).toBe(FALLBACK_TRACKS[1]!.title)
    np.stop()
  })

  it("stops rotating after a bridge track", () => {
    vi.useFakeTimers()
    const np = new NowPlayingController(1000)
    np.start()
    np.setTrack({ title: "Real Song", artist: "Bridge", album: "Album" }, "bridge")
    vi.advanceTimersByTime(5000)
    expect(np.getSnapshot()).toMatchObject({
      title: "Real Song",
      artist: "Bridge",
      source: "bridge",
    })
    np.stop()
  })

  it("notifies listeners on change", () => {
    const np = new NowPlayingController(0)
    const titles: string[] = []
    np.onChange((snap) => titles.push(snap.title))
    np.setTrack({ title: "A", artist: "B", album: "C" }, "manual")
    np.setTrack({ title: "A", artist: "B", album: "C" }, "manual")
    expect(titles).toEqual(["A"])
  })
})
