import { describe, expect, test } from "vitest"
import { dustyRecord } from "./index"

describe("dustyRecord", () => {
  test("is non-consumable dead-weight inventory junk", () => {
    expect(dustyRecord.catalogEntry.definition.stackable).toBe(false)
    expect(dustyRecord.catalogEntry.definition.maxStack).toBe(1)
    expect(dustyRecord.catalogEntry.definition.consumable).toBe(false)
    expect(dustyRecord.catalogEntry.definition.tradeable).toBe(true)
    expect(dustyRecord.catalogEntry.definition.rarity).toBe("common")
    expect(dustyRecord.catalogEntry.definition.coinValue).toBe(10)
    expect(dustyRecord.use).toBeUndefined()
  })
})
