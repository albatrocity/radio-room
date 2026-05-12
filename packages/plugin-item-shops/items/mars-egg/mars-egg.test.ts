import { describe, expect, it } from "vitest"
import { marsEgg } from "./index"
import { marsEggSellbackValue } from "./sellbackValue"
import { createMockDefinition } from "../shared/testHelpers"

describe("marsEgg", () => {
  it("sellback returns base coinValue when held under one minute", () => {
    const def = createMockDefinition("mars-egg", {
      id: "item-shops:mars-egg",
      sourcePlugin: "item-shops",
      coinValue: 32,
    })
    const now = Date.now()
    const item = {
      itemId: "i1",
      definitionId: def.id,
      sourcePlugin: "item-shops",
      quantity: 1,
      acquiredAt: now - 30_000,
    }
    expect(marsEggSellbackValue(item, def)).toBe(32)
    expect(marsEgg.sellbackValue!(item, def)).toBe(32)
  })

  it("sellback adds 1 coin per full minute held, capped", () => {
    const def = createMockDefinition("mars-egg", {
      id: "item-shops:mars-egg",
      sourcePlugin: "item-shops",
      coinValue: 32,
    })
    const now = Date.now()
    const item5m = {
      itemId: "i1",
      definitionId: def.id,
      sourcePlugin: "item-shops",
      quantity: 1,
      acquiredAt: now - 5 * 60_000,
    }
    expect(marsEggSellbackValue(item5m, def)).toBe(37)

    const item200m = {
      itemId: "i2",
      definitionId: def.id,
      sourcePlugin: "item-shops",
      quantity: 1,
      acquiredAt: now - 200 * 60_000,
    }
    expect(marsEggSellbackValue(item200m, def)).toBe(122)
  })

  it("definition is not consumable and has no use handler", () => {
    expect(marsEgg.catalogEntry.definition.consumable).toBe(false)
    expect(marsEgg.catalogEntry.definition.tradeable).toBe(true)
    expect(marsEgg.use).toBeUndefined()
    expect(marsEgg.sellbackValue).toBeDefined()
  })
})
