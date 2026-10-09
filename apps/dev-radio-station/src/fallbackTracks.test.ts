import { describe, expect, it } from "vitest"
import { FALLBACK_TRACKS, fallbackTrackAt } from "./fallbackTracks.js"

describe("fallbackTrackAt", () => {
  it("wraps indices across the playlist", () => {
    expect(fallbackTrackAt(0)).toEqual(FALLBACK_TRACKS[0])
    expect(fallbackTrackAt(FALLBACK_TRACKS.length)).toEqual(FALLBACK_TRACKS[0])
    expect(fallbackTrackAt(-1)).toEqual(FALLBACK_TRACKS[FALLBACK_TRACKS.length - 1])
  })
})
