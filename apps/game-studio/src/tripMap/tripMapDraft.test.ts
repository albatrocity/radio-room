import { ITEM_CATALOG } from "@repo/plugin-item-shops"
import { roadTripItemId, SAMPLE_TRIP_MAP, VAN_CONSUMABLES, VAN_PARTS } from "@repo/road-trip-map"
import { ITEM_SHOPS_PLUGIN_NAME } from "@repo/types"
import { describe, expect, it } from "vitest"
import { OFFER_CATALOG, parseDraft, validateCatalogShop } from "./tripMapDraft"

describe("OFFER_CATALOG", () => {
  it("includes every Item Shops catalog entry and every van item", () => {
    const ids = new Set(OFFER_CATALOG.map((option) => option.definitionId))
    expect(ids.size).toBe(OFFER_CATALOG.length)
    for (const entry of ITEM_CATALOG) {
      const definitionId = `${ITEM_SHOPS_PLUGIN_NAME}:${entry.definition.shortId}`
      const option = OFFER_CATALOG.find((item) => item.definitionId === definitionId)
      expect(option).toMatchObject({
        name: entry.definition.name,
        plugin: "item-shops",
        coinValue: entry.definition.coinValue ?? 0,
        rarity: entry.definition.rarity ?? "common",
      })
      if (entry.availableInRoomTypes) {
        expect(option?.roomTypes).toEqual([...entry.availableInRoomTypes])
      } else {
        expect(option?.roomTypes).toBeUndefined()
      }
    }
    for (const item of [...VAN_PARTS, ...VAN_CONSUMABLES]) {
      expect(OFFER_CATALOG.find((option) => option.definitionId === roadTripItemId(item.shortId))).toMatchObject({
        name: item.name,
        icon: item.emoji,
        coinValue: item.coinValue,
        plugin: "road-trip",
      })
    }
  })

  it("notes shop effects that do not follow an item into a composed shop", () => {
    expect(OFFER_CATALOG.find((option) => option.definitionId === "item-shops:fuzz-pedal")?.outsideShopNote).toBe(
      "behaves differently outside Sweetwater",
    )
    expect(OFFER_CATALOG.find((option) => option.definitionId === "item-shops:warm-beer")?.outsideShopNote).toBe(
      "behaves differently outside Green Room",
    )
    expect(OFFER_CATALOG.find((option) => option.definitionId === "item-shops:carrots")?.outsideShopNote).toBeUndefined()
  })
})

describe("validateCatalogShop", () => {
  it("accepts a listed id and rejects an unknown one", () => {
    const listed = OFFER_CATALOG.find((option) => option.definitionId === "item-shops:fuzz-pedal")
    expect(listed).toBeDefined()
    expect(validateCatalogShop({ offers: [{ definitionId: listed!.definitionId }] })).toEqual({ ok: true })
    expect(validateCatalogShop({ offers: [{ definitionId: "road-trip:jetpack" }] })).toEqual({
      ok: false,
      errors: ['Unknown item "road-trip:jetpack"'],
    })
  })

  it("warns when an offer is only sold in some room types", () => {
    expect(validateCatalogShop({ offers: [{ definitionId: "item-shops:beat-detector" }] })).toEqual({
      ok: true,
      warnings: ["Beat Detector isn't sold in every room (radio only); the van still stops"],
    })
  })

  it("surfaces that warning from parseDraft", () => {
    const draft = structuredClone(SAMPLE_TRIP_MAP)
    draft.sites[0]!.shop = { offers: [{ definitionId: "item-shops:beat-detector" }] }
    const result = parseDraft(draft, Date.now())
    expect(result.ok).toBe(true)
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "warning",
          code: "shop-availability",
          message: expect.stringContaining(
            "Beat Detector isn't sold in every room (radio only); the van still stops",
          ),
        }),
      ]),
    )
  })
})
