import { describe, expect, it } from "vitest"
import { oscilloscope, OSCILLOSCOPE_DEFINITION_ID } from "."

describe("oscilloscope", () => {
  it("registers the expected shortId and definition id constant", () => {
    expect(oscilloscope.shortId).toBe("oscilloscope")
    expect(OSCILLOSCOPE_DEFINITION_ID).toBe("item-shops:oscilloscope")
  })

  it("is a non-consumable radio-only holdable", () => {
    expect(oscilloscope.catalogEntry.definition.consumable).toBe(false)
    expect(oscilloscope.catalogEntry.definition.stackable).toBe(false)
    expect(oscilloscope.catalogEntry.definition.maxStack).toBe(1)
    expect(oscilloscope.catalogEntry.definition.tradeable).toBe(true)
    expect(oscilloscope.catalogEntry.definition.rarity).toBe("rare")
    expect(oscilloscope.catalogEntry.availableInRoomTypes).toEqual(["radio"])
    expect(oscilloscope.use).toBeUndefined()
  })
})
