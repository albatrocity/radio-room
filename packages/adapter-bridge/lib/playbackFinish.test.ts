import { describe, expect, it } from "vitest"
import {
  ADVANCE_THRESHOLD_MS,
  endedSourceMatchesActive,
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
})

describe("endedSourceMatchesActive", () => {
  it("drops ENDED from a source that is no longer active", () => {
    expect(endedSourceMatchesActive("spotify", "local")).toBe(false)
  })

  it("accepts ENDED from the active source", () => {
    expect(endedSourceMatchesActive("local", "local")).toBe(true)
  })
})
