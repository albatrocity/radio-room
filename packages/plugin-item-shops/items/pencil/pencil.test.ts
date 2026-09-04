import { describe, expect, test } from "vitest"
import { pencil } from "./index"
import { describeRestoreMediaItem } from "../shared/restoreMedia.testSupport"

describe("pencil", () => {
  test("registers as a mediaItem restorer", () => {
    expect(pencil.shortId).toBe("pencil")
    expect(pencil.catalogEntry.definition.requiresTarget).toBe("mediaItem")
    expect(pencil.catalogEntry.definition.icon).toBe("Pencil")
    expect(pencil.catalogEntry.definition.coinValue).toBe(25)
  })
})

describeRestoreMediaItem({
  item: pencil,
  itemLabel: "Pencil",
  matchingRecords: [{ format: "TAPE", name: "Mix Tape", shortId: "pm-mix" }],
  brokenShortId: "tangled-tape",
  brokenName: "Tangled Tape",
  wrongFormat: "CD",
})
