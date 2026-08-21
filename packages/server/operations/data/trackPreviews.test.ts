import { afterEach, describe, expect, test } from "vitest"
import {
  getInFlightPreviewGeneration,
  setInFlightPreviewGeneration,
  type TrackPreviewGenerationResult,
} from "./trackPreviews"

function waitForUnhandledRejectionTick() {
  return new Promise<void>((resolve) => setImmediate(resolve))
}

describe("setInFlightPreviewGeneration", () => {
  afterEach(async () => {
    await waitForUnhandledRejectionTick()
  })

  test("rejected generation cleanup does not emit unhandledRejection", async () => {
    const reasons: unknown[] = []
    const onUnhandled = (reason: unknown) => {
      reasons.push(reason)
    }
    process.on("unhandledRejection", onUnhandled)
    try {
      const generation: Promise<TrackPreviewGenerationResult> = (async () => {
        await Promise.resolve()
        throw new Error("ffmpeg missing")
      })()
      setInFlightPreviewGeneration("room1:t1", generation)
      await generation.catch(() => {})
      await waitForUnhandledRejectionTick()
      await waitForUnhandledRejectionTick()
      expect(reasons).toEqual([])
      expect(getInFlightPreviewGeneration("room1:t1")).toBeUndefined()
    } finally {
      process.off("unhandledRejection", onUnhandled)
    }
  })
})
