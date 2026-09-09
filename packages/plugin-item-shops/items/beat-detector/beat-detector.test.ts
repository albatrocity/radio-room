import { describe, expect, it } from "vitest"
import { beatDetector, BEAT_DETECTOR_DEFINITION_ID } from "."

describe("beatDetector", () => {
  it("registers the expected shortId and definition id constant", () => {
    expect(beatDetector.shortId).toBe("beat-detector")
    expect(BEAT_DETECTOR_DEFINITION_ID).toBe("item-shops:beat-detector")
  })

  it("is a non-consumable radio-only holdable", () => {
    expect(beatDetector.catalogEntry.definition.consumable).toBe(false)
    expect(beatDetector.catalogEntry.definition.stackable).toBe(false)
    expect(beatDetector.catalogEntry.definition.maxStack).toBe(1)
    expect(beatDetector.catalogEntry.definition.tradeable).toBe(true)
    expect(beatDetector.catalogEntry.definition.rarity).toBe("rare")
    expect(beatDetector.catalogEntry.definition.coinValue).toBe(50)
    expect(beatDetector.catalogEntry.definition.icon).toBe("Radar")
    expect(beatDetector.catalogEntry.availableInRoomTypes).toEqual(["radio"])
    expect(beatDetector.use).toBeUndefined()
  })
})
