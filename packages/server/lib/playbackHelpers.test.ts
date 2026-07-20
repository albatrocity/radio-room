import { describe, it, expect } from "vitest"
import {
  shouldAdvanceToNextQueueItem,
  PLAYBACK_END_THRESHOLD_MS,
  MID_TRACK_RESUME_MIN_MS,
} from "./playbackHelpers"

describe("shouldAdvanceToNextQueueItem", () => {
  const queue = [{ locked: false }]

  it("returns false when playing", () => {
    expect(
      shouldAdvanceToNextQueueItem(
        { state: "playing", track: { id: "t1" }, progressMs: 1000, durationMs: 180_000 },
        queue,
      ),
    ).toBe(false)
  })

  it("returns false when queue is empty", () => {
    expect(
      shouldAdvanceToNextQueueItem({ state: "paused", track: null, progressMs: null }, []),
    ).toBe(false)
  })

  it("returns false when paused mid-track even without track context", () => {
    expect(
      shouldAdvanceToNextQueueItem(
        {
          state: "paused",
          track: null,
          progressMs: 60_000,
          durationMs: 180_000,
        },
        queue,
      ),
    ).toBe(false)
  })

  it("returns true when paused with no track context and queue has items", () => {
    expect(
      shouldAdvanceToNextQueueItem({ state: "paused", track: null, progressMs: null }, queue),
    ).toBe(true)
  })

  it("returns true when paused near end of track", () => {
    expect(
      shouldAdvanceToNextQueueItem(
        {
          state: "paused",
          track: { id: "t1" },
          progressMs: 180_000 - PLAYBACK_END_THRESHOLD_MS,
          durationMs: 180_000,
        },
        queue,
      ),
    ).toBe(true)
  })

  it("returns false when paused mid-track", () => {
    expect(
      shouldAdvanceToNextQueueItem(
        { state: "paused", track: { id: "t1" }, progressMs: 60_000, durationMs: 180_000 },
        queue,
      ),
    ).toBe(false)
  })

  it("returns true when auto-advance is off and progress reset to 0 after natural end", () => {
    expect(
      shouldAdvanceToNextQueueItem(
        { state: "paused", track: { id: "t1" }, progressMs: 0, durationMs: 180_000 },
        queue,
        { queueAutoAdvance: false },
      ),
    ).toBe(true)
  })

  it("returns false when auto-advance is off but paused mid-track", () => {
    expect(
      shouldAdvanceToNextQueueItem(
        {
          state: "paused",
          track: { id: "t1" },
          progressMs: MID_TRACK_RESUME_MIN_MS + 5000,
          durationMs: 180_000,
        },
        queue,
        { queueAutoAdvance: false },
      ),
    ).toBe(false)
  })

  it("returns false when auto-advance is on and progress reset to 0 (resume finished track)", () => {
    expect(
      shouldAdvanceToNextQueueItem(
        { state: "paused", track: { id: "t1" }, progressMs: 0, durationMs: 180_000 },
        queue,
        { queueAutoAdvance: true },
      ),
    ).toBe(false)
  })
})
