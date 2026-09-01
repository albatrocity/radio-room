import { describe, expect, it, beforeEach } from "vitest"
import {
  __resetRadioStreamPlayerForTests,
  getRadioStreamPlayerStatus,
  setRadioStreamPlayerPlaying,
  setRadioStreamPlayerUrl,
  stopRadioStreamPlayer,
} from "./radioStreamActor"

const STREAM_URL = "https://example.com/stream.mp3"

describe("radioStreamActor", () => {
  beforeEach(() => {
    __resetRadioStreamPlayerForTests()
  })

  it("starts idle and clears on stop", () => {
    expect(getRadioStreamPlayerStatus().phase).toBe("idle")
    setRadioStreamPlayerUrl(STREAM_URL)
    expect(getRadioStreamPlayerStatus().url).toContain("example.com")
    stopRadioStreamPlayer()
    expect(getRadioStreamPlayerStatus().url).toBeNull()
    expect(getRadioStreamPlayerStatus().phase).toBe("idle")
  })

  it("tracks play intent", () => {
    setRadioStreamPlayerUrl(STREAM_URL)
    setRadioStreamPlayerPlaying(true)
    expect(getRadioStreamPlayerStatus().playingDesired).toBe(true)

    setRadioStreamPlayerPlaying(false)
    expect(getRadioStreamPlayerStatus().playingDesired).toBe(false)
    expect(getRadioStreamPlayerStatus().suspended).toBe(true)
    expect(getRadioStreamPlayerStatus().phase).toBe("idle")
  })

  /**
   * Playback stays "connecting" until the element reports `playing` — the
   * element, not a decode pipeline, now decides when audio actually started.
   * (These tests run without a DOM, so that event never arrives.)
   */
  it("leaves idle for the element on play", () => {
    setRadioStreamPlayerUrl(STREAM_URL)
    setRadioStreamPlayerPlaying(true)
    expect(getRadioStreamPlayerStatus().phase).toBe("connecting")
  })

  it("pause returns to idle and clears play intent", () => {
    setRadioStreamPlayerUrl(STREAM_URL)
    setRadioStreamPlayerPlaying(true)
    setRadioStreamPlayerPlaying(false)
    expect(getRadioStreamPlayerStatus().phase).toBe("idle")
    expect(getRadioStreamPlayerStatus().playingDesired).toBe(false)
  })
})
