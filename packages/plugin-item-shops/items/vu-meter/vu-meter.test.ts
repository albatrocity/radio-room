import { describe, expect, it } from "vitest"
import { vuMeter, VU_METER_DEFINITION_ID } from "."

describe("vuMeter", () => {
  it("registers the expected shortId and definition id constant", () => {
    expect(vuMeter.shortId).toBe("vu-meter")
    expect(VU_METER_DEFINITION_ID).toBe("item-shops:vu-meter")
  })

  it("is a non-consumable radio-only holdable", () => {
    expect(vuMeter.catalogEntry.definition.consumable).toBe(false)
    expect(vuMeter.catalogEntry.definition.stackable).toBe(false)
    expect(vuMeter.catalogEntry.definition.maxStack).toBe(1)
    expect(vuMeter.catalogEntry.definition.tradeable).toBe(true)
    expect(vuMeter.catalogEntry.definition.rarity).toBe("rare")
    expect(vuMeter.catalogEntry.definition.coinValue).toBe(50)
    expect(vuMeter.catalogEntry.definition.icon).toBe("Gauge")
    expect(vuMeter.catalogEntry.availableInRoomTypes).toEqual(["radio"])
    expect(vuMeter.use).toBeUndefined()
  })
})
