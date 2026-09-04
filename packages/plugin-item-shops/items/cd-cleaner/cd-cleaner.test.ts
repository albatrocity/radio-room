import { describe, expect, test } from "vitest"
import { cdCleaner } from "./index"
import { describeRestoreMediaItem } from "../shared/restoreMedia.testSupport"

describe("cdCleaner", () => {
  test("registers as a mediaItem restorer", () => {
    expect(cdCleaner.shortId).toBe("cd-cleaner")
    expect(cdCleaner.catalogEntry.definition.requiresTarget).toBe("mediaItem")
    expect(cdCleaner.catalogEntry.definition.icon).toBe("SprayCan")
  })
})

describeRestoreMediaItem({
  item: cdCleaner,
  itemLabel: "CD Cleaner",
  matchingRecords: [{ format: "CD", name: "Kid A", shortId: "pm-kid-a" }],
  brokenShortId: "scratched-cd",
  brokenName: "Scratched CD",
  wrongFormat: "LP",
})
