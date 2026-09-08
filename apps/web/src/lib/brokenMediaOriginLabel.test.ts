import { describe, expect, it } from "vitest"
import type { InventoryItem, ItemDefinition } from "@repo/types"
import {
  brokenMediaOriginLabel,
  inventoryDisplayDescription,
} from "./brokenMediaOriginLabel"

describe("brokenMediaOriginLabel", () => {
  const originDef = {
    id: "item-shops:pm-kid-a",
    shortId: "pm-kid-a",
    name: "CD: Kid A",
  } as ItemDefinition
  const scratched = {
    id: "item-shops:scratched-cd",
    shortId: "scratched-cd",
    name: "Scratched CD",
  } as ItemDefinition
  const map = new Map<string, ItemDefinition>([
    [originDef.id, originDef],
    [scratched.id, scratched],
  ])

  it("prefers denormalized mediaOriginTitle without needing the origin def", () => {
    const item = {
      itemId: "b1",
      definitionId: scratched.id,
      quantity: 1,
      acquiredAt: 1,
      metadata: {
        mediaOrigin: originDef.id,
        mediaOriginTitle: "Kid A",
      },
    } as InventoryItem
    expect(brokenMediaOriginLabel(item, scratched)).toBe(
      "This looks like Kid A, but it's hard to tell",
    )
  })

  it("falls back to definitionMap for legacy stacks without a title", () => {
    const item = {
      itemId: "b1",
      definitionId: scratched.id,
      quantity: 1,
      acquiredAt: 1,
      metadata: { mediaOrigin: originDef.id },
    } as InventoryItem
    expect(brokenMediaOriginLabel(item, scratched, map)).toBe(
      "This looks like Kid A, but it's hard to tell",
    )
  })

  it("returns undefined without mediaOrigin or title", () => {
    const item = {
      itemId: "b1",
      definitionId: scratched.id,
      quantity: 1,
      acquiredAt: 1,
    } as InventoryItem
    expect(brokenMediaOriginLabel(item, scratched, map)).toBeUndefined()
  })

  it("returns undefined for non-broken SKUs", () => {
    const item = {
      itemId: "p1",
      definitionId: originDef.id,
      quantity: 1,
      acquiredAt: 1,
      metadata: { mediaOrigin: originDef.id, mediaOriginTitle: "Kid A" },
    } as InventoryItem
    expect(brokenMediaOriginLabel(item, originDef, map)).toBeUndefined()
  })
})

describe("inventoryDisplayDescription", () => {
  it("joins definition description with an origin hint", () => {
    const def = {
      description: "Useless without a cleaner.",
    } as ItemDefinition
    expect(
      inventoryDisplayDescription(def, "This looks like Kid A, but it's hard to tell"),
    ).toBe("Useless without a cleaner. This looks like Kid A, but it's hard to tell")
  })
})
