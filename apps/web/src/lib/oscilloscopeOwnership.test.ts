import { describe, expect, it } from "vitest"
import type { UserInventory } from "@repo/types"
import {
  OSCILLOSCOPE_DEFINITION_ID,
  inventoryOwnsOscilloscope,
} from "./oscilloscopeOwnership"

function inv(items: UserInventory["items"]): UserInventory {
  return { userId: "u1", items, maxSlots: 20, maxCollectionSlots: 20 }
}

describe("inventoryOwnsOscilloscope", () => {
  it("returns false for empty / missing inventory", () => {
    expect(inventoryOwnsOscilloscope(null)).toBe(false)
    expect(inventoryOwnsOscilloscope(undefined)).toBe(false)
    expect(inventoryOwnsOscilloscope(inv([]))).toBe(false)
  })

  it("returns true only when oscilloscope quantity > 0", () => {
    expect(
      inventoryOwnsOscilloscope(
        inv([
          {
            itemId: "a",
            definitionId: OSCILLOSCOPE_DEFINITION_ID,
            sourcePlugin: "item-shops",
            quantity: 1,
            acquiredAt: 1,
          },
        ]),
      ),
    ).toBe(true)

    expect(
      inventoryOwnsOscilloscope(
        inv([
          {
            itemId: "a",
            definitionId: OSCILLOSCOPE_DEFINITION_ID,
            sourcePlugin: "item-shops",
            quantity: 0,
            acquiredAt: 1,
          },
        ]),
      ),
    ).toBe(false)

    expect(
      inventoryOwnsOscilloscope(
        inv([
          {
            itemId: "b",
            definitionId: "item-shops:fuzz-pedal",
            sourcePlugin: "item-shops",
            quantity: 2,
            acquiredAt: 1,
          },
        ]),
      ),
    ).toBe(false)
  })
})
