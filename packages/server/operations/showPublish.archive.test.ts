import { describe, it, expect } from "vitest"

/**
 * Documents the finalize rule: only segments with `isRecurring === false` are archived.
 * (Production code applies this via Drizzle `eq(segment.isRecurring, false)`.)
 */
function segmentIdsEligibleForArchive(
  showSegmentIds: string[],
  isRecurringBySegmentId: Record<string, boolean>,
): string[] {
  return showSegmentIds.filter((id) => isRecurringBySegmentId[id] === false)
}

describe("show publish segment archival rule", () => {
  it("archives only non-recurring segments from the show", () => {
    const ids = segmentIdsEligibleForArchive(["a", "b", "c"], {
      a: false,
      b: true,
      c: false,
    })
    expect(ids).toEqual(["a", "c"])
  })

  it("archives none when all are recurring", () => {
    expect(
      segmentIdsEligibleForArchive(["x"], {
        x: true,
      }),
    ).toEqual([])
  })
})
