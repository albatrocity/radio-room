import { describe, expect, test } from "vitest"
import { tangledTape } from "./index"

describe("tangledTape", () => {
  test("is non-consumable dead-weight inventory junk", () => {
    expect(tangledTape.catalogEntry.definition.stackable).toBe(false)
    expect(tangledTape.catalogEntry.definition.maxStack).toBe(1)
    expect(tangledTape.catalogEntry.definition.consumable).toBe(false)
    expect(tangledTape.catalogEntry.definition.tradeable).toBe(true)
    expect(tangledTape.catalogEntry.definition.rarity).toBe("common")
    expect(tangledTape.catalogEntry.definition.coinValue).toBe(10)
    expect(tangledTape.use).toBeUndefined()
  })
})
