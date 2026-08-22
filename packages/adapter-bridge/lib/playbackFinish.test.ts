import { describe, expect, it } from "vitest"
import {
  ADVANCE_THRESHOLD_MS,
  endedSourceMatchesActive,
  endedTrackIsStale,
  endSignalIsSpent,
  isNaturalFinish,
  isNearEnd,
  lastStateShouldAdvance,
} from "./playbackFinish"

const DURATION = 180_000

describe("isNearEnd", () => {
  it("is true in the last second", () => {
    expect(isNearEnd(DURATION - ADVANCE_THRESHOLD_MS, DURATION)).toBe(true)
  })

  it("is false a few seconds before the end", () => {
    expect(isNearEnd(DURATION - 3_000, DURATION)).toBe(false)
  })
})

describe("isNaturalFinish", () => {
  it("treats playing in the last second as ready to advance", () => {
    expect(
      isNaturalFinish(
        { state: "playing", progressMs: DURATION - 400, durationMs: DURATION },
        null,
      ),
    ).toBe(true)
  })

  it("treats paused-at-end as finished (Spotify SDK typical end)", () => {
    expect(
      isNaturalFinish(
        { state: "paused", progressMs: DURATION, durationMs: DURATION },
        { state: "playing", progressMs: DURATION - 2_000, durationMs: DURATION },
      ),
    ).toBe(true)
  })

  it("treats paused-at-0 after approaching the end as finished", () => {
    expect(
      isNaturalFinish(
        { state: "paused", progressMs: 0, durationMs: DURATION },
        { state: "playing", progressMs: DURATION - 4_000, durationMs: DURATION },
      ),
    ).toBe(true)
  })

  it("treats stopped with no media after being in the last second as finished", () => {
    expect(
      isNaturalFinish(
        { state: "stopped", progressMs: null, durationMs: null },
        { state: "playing", progressMs: DURATION - 500, durationMs: DURATION },
      ),
    ).toBe(true)
  })

  it("does not treat a mid-track pause as finished", () => {
    expect(
      isNaturalFinish(
        { state: "paused", progressMs: 60_000, durationMs: DURATION },
        { state: "playing", progressMs: 59_000, durationMs: DURATION },
      ),
    ).toBe(false)
  })

  it("does not treat a mid-track pause-to-other-source as finished", () => {
    expect(
      isNaturalFinish(
        { state: "stopped", progressMs: null, durationMs: null },
        { state: "playing", progressMs: 60_000, durationMs: DURATION },
      ),
    ).toBe(false)
  })

  it("ignores a stale previous-track end after a new URI has started", () => {
    expect(
      isNaturalFinish(
        {
          state: "paused",
          progressMs: DURATION,
          durationMs: DURATION,
          trackId: "track-a",
        },
        { state: "playing", progressMs: 4_000, durationMs: DURATION, trackId: "track-b" },
      ),
    ).toBe(false)
  })

  it("does not treat a tiny loading duration as near end", () => {
    expect(isNearEnd(0, 800)).toBe(false)
    expect(
      isNaturalFinish({ state: "paused", progressMs: 0, durationMs: 800 }, null),
    ).toBe(false)
  })
})

describe("lastStateShouldAdvance", () => {
  it("ignores a prior source's end pulse while another source is active", () => {
    expect(
      lastStateShouldAdvance(
        {
          source: "spotify",
          state: "stopped",
          progressMs: DURATION,
          durationMs: DURATION,
        },
        "local",
      ),
    ).toBe(false)
  })

  it("advances when the active source is paused at end", () => {
    expect(
      lastStateShouldAdvance(
        {
          source: "spotify",
          state: "paused",
          progressMs: DURATION - 200,
          durationMs: DURATION,
        },
        "spotify",
      ),
    ).toBe(true)
  })

  it("ignores an end pulse whose trackId is not the current track", () => {
    expect(
      lastStateShouldAdvance(
        {
          source: "spotify",
          state: "paused",
          progressMs: DURATION,
          durationMs: DURATION,
          trackId: "track-a",
        },
        "spotify",
        "track-b",
      ),
    ).toBe(false)
  })
})

describe("endedSourceMatchesActive", () => {
  it("drops ENDED from a source that is no longer active", () => {
    expect(endedSourceMatchesActive("spotify", "local")).toBe(false)
  })

  it("accepts ENDED from the active source", () => {
    expect(endedSourceMatchesActive("local", "local")).toBe(true)
  })
})

describe("endSignalIsSpent", () => {
  const now = 1_000_000

  it("drops the daemon's end confirmation that lands just after our near-end advance", () => {
    // Observed live: probe advanced at T, daemon wrote last_ended 800ms later.
    expect(endSignalIsSpent({ at: now - 11_000, lastAdvanceAt: now - 12_000, now })).toBe(true)
  })

  it("drops a durable key read long after it was written", () => {
    expect(endSignalIsSpent({ at: now - 56_000, lastAdvanceAt: now - 90_000, now })).toBe(true)
  })

  it("applies an end signal for a track that has been playing since the last advance", () => {
    expect(endSignalIsSpent({ at: now, lastAdvanceAt: now - 180_000, now })).toBe(false)
  })

  it("applies when nothing has advanced yet (fresh process)", () => {
    expect(endSignalIsSpent({ at: now - 500, lastAdvanceAt: 0, now })).toBe(false)
  })

  it("applies when the signal carries no timestamp", () => {
    expect(endSignalIsSpent({ at: undefined, lastAdvanceAt: now - 1_000, now })).toBe(false)
  })
})

describe("endedTrackIsStale", () => {
  it("drops a replayed ENDED for a URI we already advanced past", () => {
    expect(endedTrackIsStale("track-a", "track-b", ["track-a"])).toBe(true)
  })

  it("accepts ENDED for the current URI", () => {
    expect(endedTrackIsStale("track-b", "track-b", ["track-a"])).toBe(false)
  })

  it("accepts ENDED for an unrecognised id so a mismatch cannot stall advancing", () => {
    expect(endedTrackIsStale("relinked-id", "track-b", ["track-a"])).toBe(false)
    expect(endedTrackIsStale("track-a", null, [])).toBe(false)
    expect(endedTrackIsStale(undefined, "track-b", ["track-a"])).toBe(false)
  })

  it("treats spotify:track: prefix as the same id", () => {
    expect(endedTrackIsStale("spotify:track:abc", "abc", ["abc"])).toBe(false)
    expect(endedTrackIsStale("spotify:track:abc", "def", ["abc"])).toBe(true)
    expect(
      lastStateShouldAdvance(
        {
          source: "spotify",
          state: "playing",
          progressMs: DURATION - 200,
          durationMs: DURATION,
          trackId: "abc",
        },
        "spotify",
        "spotify:track:abc",
      ),
    ).toBe(true)
  })
})
