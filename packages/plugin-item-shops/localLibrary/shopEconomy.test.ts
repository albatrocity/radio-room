import { describe, expect, it, vi, afterEach } from "vitest"
import type { InventoryItem, ItemDefinition } from "@repo/types"
import type { ItemCatalogEntry } from "@repo/plugin-base/helpers"
import { physicalMediaShopEconomyHooks } from "./shopEconomy"

function catalogEntry(
  definition: Partial<ItemCatalogEntry["definition"]> & { shortId: string; name: string },
  grant?: ItemCatalogEntry["localLibraryGrant"],
): ItemCatalogEntry {
  return {
    definition: {
      description: "",
      stackable: false,
      maxStack: 1,
      tradeable: true,
      consumable: false,
      coinValue: 20,
      ...definition,
    },
    ...(grant ? { localLibraryGrant: grant } : {}),
  }
}

const PM = catalogEntry(
  { shortId: "pm-loveless", name: "LP: Loveless", mediaFormat: "LP", artworkFrame: "record-jacket" },
  { scope: "playlist", playlistKey: "pm-loveless", redemption: "durable" },
)

const LIBRARY_CARD = catalogEntry(
  { shortId: "library-pass", name: "Library Pass", stackable: true, maxStack: 3 },
  { scope: "library", redemption: "perQueue" },
)

const SCRATCHED = catalogEntry({
  shortId: "scratched-cd",
  name: "Scratched CD",
  stackable: true,
  maxStack: 3,
  consumable: true,
  coinValue: 75,
})

describe("physicalMediaShopEconomyHooks", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("rolls condition and scales price only for Physical Media", () => {
    vi.spyOn(Math, "random").mockReturnValue(0)
    const hooks = physicalMediaShopEconomyHooks()
    expect(hooks.decorateOffer?.(PM, 20)).toEqual({ condition: "mint", price: 20 })
    expect(hooks.decorateOffer?.(LIBRARY_CARD, 100)).toEqual({})
    expect(hooks.decorateOffer?.(SCRATCHED, 75)).toEqual({})
  })

  it("respects live offer condition bounds", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99)
    const hooks = physicalMediaShopEconomyHooks(() => ({ min: "mint", max: "mint" }))
    expect(hooks.decorateOffer?.(PM, 20)).toEqual({ condition: "mint", price: 20 })
  })

  it("scales sellback for Physical Media and leaves other SKUs alone", () => {
    const hooks = physicalMediaShopEconomyHooks()
    const item: InventoryItem = {
      itemId: "i1",
      definitionId: "item-shops:pm-loveless",
      sourcePlugin: "item-shops",
      quantity: 1,
      acquiredAt: 1,
      metadata: { condition: "poor" },
    }
    const pmDef: ItemDefinition = {
      id: "item-shops:pm-loveless",
      sourcePlugin: "item-shops",
      ...PM.definition,
    }
    const cardDef: ItemDefinition = {
      id: "item-shops:library-pass",
      sourcePlugin: "item-shops",
      ...LIBRARY_CARD.definition,
    }
    expect(hooks.adjustSellBase?.(item, pmDef, 20)).toBe(9)
    expect(hooks.adjustSellBase?.(item, cardDef, 100)).toBe(100)
  })
})
