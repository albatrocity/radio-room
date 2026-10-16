import { describe, it, expect } from "vitest"
import {
  isStreamingMode,
  isTrackDetectionEnabled,
  streamingCoverUrl,
  streamingDisplayChanged,
} from "./streamingMode"

describe("isStreamingMode", () => {
  it("returns true for a radio room with fetchMeta off", () => {
    expect(isStreamingMode({ fetchMeta: false, type: "radio" })).toBe(true)
  })

  it("returns false for a radio room with fetchMeta on", () => {
    expect(isStreamingMode({ fetchMeta: true, type: "radio" })).toBe(false)
  })

  it("returns true for a live room with fetchMeta off", () => {
    expect(isStreamingMode({ fetchMeta: false, type: "live" })).toBe(true)
  })

  it("returns false for a live room with fetchMeta on", () => {
    expect(isStreamingMode({ fetchMeta: true, type: "live" })).toBe(false)
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

describe("streamingCoverUrl", () => {
  it("returns the segment or room cover while track detection is off", () => {
    expect(
      streamingCoverUrl({ fetchMeta: false, type: "radio" }, " https://cdn/segment.jpg "),
    ).toBe("https://cdn/segment.jpg")
    expect(streamingCoverUrl({ fetchMeta: false, type: "live" }, "https://cdn/room.jpg")).toBe(
      "https://cdn/room.jpg",
    )
  })

  it("returns null when there is no cover or track detection is on", () => {
    expect(streamingCoverUrl({ fetchMeta: false, type: "radio" }, "  ")).toBeNull()
    expect(streamingCoverUrl({ fetchMeta: false, type: "radio" }, null)).toBeNull()
    expect(
      streamingCoverUrl({ fetchMeta: true, type: "radio" }, "https://cdn/segment.jpg"),
    ).toBeNull()
    expect(
      streamingCoverUrl({ fetchMeta: false, type: "jukebox" }, "https://cdn/segment.jpg"),
    ).toBeNull()
  })
})

describe("streamingDisplayChanged", () => {
  it("returns true when title changes", () => {
    expect(streamingDisplayChanged({ title: "A" }, { title: "B" })).toBe(true)
  })

  it("returns true when artwork changes", () => {
    expect(streamingDisplayChanged({ artwork: "a.png" }, { artwork: "b.png" })).toBe(true)
  })

  it("ignores showSchedulePublic (segment title shows regardless)", () => {
    expect(
      streamingDisplayChanged(
        { showSchedulePublic: true } as never,
        { showSchedulePublic: false } as never,
      ),
    ).toBe(false)
  })

  it("returns true when activeSegmentId changes", () => {
    expect(streamingDisplayChanged({ activeSegmentId: "a" }, { activeSegmentId: "b" })).toBe(true)
  })

  it("returns false when nothing relevant changed", () => {
    const fields = {
      title: "Room",
      artwork: "img.png",
      activeSegmentId: "seg-1",
    }
    expect(streamingDisplayChanged(fields, { ...fields })).toBe(false)
  })
})
