import { describe, expect, it, beforeEach } from "vitest"
import {
  __resetRadioStreamPlayerForTests,
  getRadioStreamPlayerStatus,
  setRadioStreamPlayerPlaying,
  setRadioStreamPlayerUrl,
  stopRadioStreamPlayer,
} from "./radioStreamPlayer"

describe("radioStreamPlayer", () => {
  beforeEach(() => {
    __resetRadioStreamPlayerForTests()
  })

  it("starts idle and clears on stop", () => {
    expect(getRadioStreamPlayerStatus().phase).toBe("idle")
    setRadioStreamPlayerUrl("https://example.com/stream.mp3")
    expect(getRadioStreamPlayerStatus().url).toContain("example.com")
    stopRadioStreamPlayer()
    expect(getRadioStreamPlayerStatus().url).toBeNull()
    expect(getRadioStreamPlayerStatus().phase).toBe("idle")
  })

  it("records playingDesired without throwing when AudioContext is unavailable", () => {
    setRadioStreamPlayerUrl("https://example.com/stream.mp3")
    setRadioStreamPlayerPlaying(true)
    expect(getRadioStreamPlayerStatus().playingDesired).toBe(true)
    setRadioStreamPlayerPlaying(false)
    expect(getRadioStreamPlayerStatus().playingDesired).toBe(false)
    expect(getRadioStreamPlayerStatus().suspended).toBe(true)
    expect(getRadioStreamPlayerStatus().phase).toBe("idle")
  })
})
