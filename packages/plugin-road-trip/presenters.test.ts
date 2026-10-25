import { describe, expect, it } from "vitest"
import type { TripSite } from "@repo/road-trip-map"
import { skipPollPresentation } from "./presenters"

const site = {
  id: "record-store",
  name: "Dusty Boots Records",
  mile: 4,
  icon: "📀",
} as TripSite

describe("skipPollPresentation", () => {
  it("carries the site id when the sign names the stop", () => {
    expect(skipPollPresentation(site, false, "skip").subjectId).toBe("record-store")
  })

  it("omits the site id on a mystery sign", () => {
    const presentation = skipPollPresentation(site, true, "stop")
    expect(presentation.subjectId).toBeUndefined()
    expect(presentation.headline).toBe("SOMETHING UP AHEAD")
  })
})
