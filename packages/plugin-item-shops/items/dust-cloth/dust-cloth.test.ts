import { describe, expect, test } from "vitest"
import { dustCloth } from "./index"
import { describeRestoreMediaItem } from "../shared/restoreMedia.testSupport"

describe("dustCloth", () => {
  test("registers as a mediaItem restorer", () => {
    expect(dustCloth.shortId).toBe("dust-cloth")
    expect(dustCloth.catalogEntry.definition.requiresTarget).toBe("mediaItem")
    expect(dustCloth.catalogEntry.definition.icon).toBe("Wind")
  })
})

describeRestoreMediaItem({
  item: dustCloth,
  itemLabel: "Dust Cloth",
  matchingRecords: [
    { format: "LP", name: "Loveless", shortId: "pm-loveless" },
    { format: "45", name: "Come as You Are", shortId: "pm-come-as" },
  ],
  brokenShortId: "dusty-record",
  brokenName: "Dusty Record",
  wrongFormat: "CD",
})
