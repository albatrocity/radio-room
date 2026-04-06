import { describe, it, expect } from "vitest"
import { isStreamingMode, isTrackDetectionEnabled, streamingDisplayChanged } from "./streamingMode"

describe("isStreamingMode", () => {
  it("returns true for a radio room with fetchMeta off", () => {
    expect(isStreamingMode({ fetchMeta: false, type: "radio" })).toBe(true)
  })

  it("returns false for a radio room with fetchMeta on", () => {
    expect(isStreamingMode({ fetchMeta: true, type: "radio" })).toBe(false)
  })

  it("returns false for a jukebox room with fetchMeta off", () => {
    expect(isStreamingMode({ fetchMeta: false, type: "jukebox" })).toBe(false)
  })

  it("returns false for null/undefined room", () => {
    expect(isStreamingMode(null)).toBe(false)
    expect(isStreamingMode(undefined)).toBe(false)
  })
})

describe("isTrackDetectionEnabled", () => {
  it("returns true when fetchMeta is on", () => {
    expect(isTrackDetectionEnabled({ fetchMeta: true })).toBe(true)
  })

  it("returns false when fetchMeta is off", () => {
    expect(isTrackDetectionEnabled({ fetchMeta: false })).toBe(false)
  })

  it("returns false for null/undefined room", () => {
    expect(isTrackDetectionEnabled(null)).toBe(false)
    expect(isTrackDetectionEnabled(undefined)).toBe(false)
  })
})

describe("streamingDisplayChanged", () => {
  it("returns true when title changes", () => {
    expect(streamingDisplayChanged({ title: "A" }, { title: "B" })).toBe(true)
  })

  it("returns true when artwork changes", () => {
    expect(streamingDisplayChanged({ artwork: "a.png" }, { artwork: "b.png" })).toBe(true)
  })

  it("returns true when showSchedulePublic changes", () => {
    expect(
      streamingDisplayChanged({ showSchedulePublic: true }, { showSchedulePublic: false }),
    ).toBe(true)
  })

  it("returns true when activeSegmentId changes", () => {
    expect(
      streamingDisplayChanged({ activeSegmentId: "a" }, { activeSegmentId: "b" }),
    ).toBe(true)
  })

  it("returns false when nothing relevant changed", () => {
    const fields = {
      title: "Room",
      artwork: "img.png",
      showSchedulePublic: true,
      activeSegmentId: "seg-1",
    }
    expect(streamingDisplayChanged(fields, { ...fields })).toBe(false)
  })
})
