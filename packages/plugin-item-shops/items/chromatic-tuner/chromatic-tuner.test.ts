import { describe, expect, it } from "vitest"
import { chromaticTuner, CHROMATIC_TUNER_DEFINITION_ID } from "."

describe("chromaticTuner", () => {
  it("registers the expected shortId and definition id constant", () => {
    expect(chromaticTuner.shortId).toBe("chromatic-tuner")
    expect(CHROMATIC_TUNER_DEFINITION_ID).toBe("item-shops:chromatic-tuner")
  })

  it("is a non-consumable radio-only holdable", () => {
    expect(chromaticTuner.catalogEntry.definition.consumable).toBe(false)
    expect(chromaticTuner.catalogEntry.definition.stackable).toBe(false)
    expect(chromaticTuner.catalogEntry.definition.maxStack).toBe(1)
    expect(chromaticTuner.catalogEntry.definition.tradeable).toBe(true)
    expect(chromaticTuner.catalogEntry.definition.rarity).toBe("rare")
    expect(chromaticTuner.catalogEntry.definition.coinValue).toBe(50)
    expect(chromaticTuner.catalogEntry.definition.icon).toBe("Music2")
    expect(chromaticTuner.catalogEntry.availableInRoomTypes).toEqual(["radio"])
    expect(chromaticTuner.use).toBeUndefined()
  })
})
