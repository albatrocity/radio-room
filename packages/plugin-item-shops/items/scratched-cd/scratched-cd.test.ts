import { describe, expect, test } from "vitest"
import { scratchedCd } from "./index"

describe("scratchedCd", () => {
  test("is non-consumable dead-weight inventory junk", () => {
    expect(scratchedCd.catalogEntry.definition.stackable).toBe(false)
    expect(scratchedCd.catalogEntry.definition.maxStack).toBe(1)
    expect(scratchedCd.catalogEntry.definition.consumable).toBe(false)
    expect(scratchedCd.catalogEntry.definition.tradeable).toBe(true)
    expect(scratchedCd.catalogEntry.definition.rarity).toBe("common")
    expect(scratchedCd.catalogEntry.definition.coinValue).toBe(10)
    expect(scratchedCd.use).toBeUndefined()
  })
})
