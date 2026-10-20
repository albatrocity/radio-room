import { describe, expect, it } from "vitest"
import type { ItemCatalogEntry, ItemShopsShopCatalogEntry } from "@repo/plugin-base/helpers"
import { MAX_RECORD_GENRES, normalizeRecordGenres, type PhysicalMediaFormat } from "@repo/types"
import { countMatchingPhysicalMedia, matchingPhysicalMedia } from "./physicalMediaStock"
import { buildEffectiveShopCatalog, RECORD_STORE_SHOP_ID, withPhysicalMediaStock } from "./catalog"
import { RECORD_STORE_FIXED_ITEMS } from "./shops/record-store"

function record(shortId: string, mediaFormat?: PhysicalMediaFormat, genres?: string[]): ItemCatalogEntry {
  return {
    definition: {
      shortId,
      name: shortId,
      description: "",
      stackable: false,
      maxStack: 1,
      tradeable: true,
      consumable: false,
      coinValue: 25,
      ...(mediaFormat ? { mediaFormat } : {}),
      ...(genres ? { genres } : {}),
    },
  }
}

const derived = [
  record("country-cd", "CD", ["Country"]),
  record("country-lp", "LP", ["country", "Outlaw"]),
  record("rock-cd", "CD", ["Rock"]),
  record("untagged-cd", "CD"),
]

const ids = (items: { shortId: string }[]) => items.map((i) => i.shortId)

describe("matchingPhysicalMedia", () => {
  it("matches every record for an empty carry, never a non-record", () => {
    expect(ids(matchingPhysicalMedia([...derived, record("pedal")], {}))).toEqual([
      "country-cd",
      "country-lp",
      "rock-cd",
      "untagged-cd",
    ])
  })

  it("needs any listed format and any listed genre, case-insensitively", () => {
    expect(ids(matchingPhysicalMedia(derived, { formats: ["CD"], genres: ["COUNTRY"] }))).toEqual([
      "country-cd",
    ])
    expect(ids(matchingPhysicalMedia(derived, { genres: [" country "] }))).toEqual([
      "country-cd",
      "country-lp",
    ])
  })

  it("keeps untagged records for a format-only carry and drops them for a genre carry", () => {
    expect(ids(matchingPhysicalMedia(derived, { formats: ["CD"] }))).toContain("untagged-cd")
    expect(ids(matchingPhysicalMedia(derived, { genres: ["Rock"] }))).toEqual(["rock-cd"])
  })

  it("prices from the definition", () => {
    expect(matchingPhysicalMedia([record("a", "CD")], {})).toEqual([{ shortId: "a", coinValue: 25 }])
  })

  it("counts the same records it would stock", () => {
    for (const carry of [{}, { formats: ["CD" as const] }, { genres: ["country"] }, { genres: ["Polka"] }]) {
      expect(countMatchingPhysicalMedia(derived, carry)).toBe(matchingPhysicalMedia(derived, carry).length)
    }
  })

  it("caps genres read off an album, keeping first-seen order", () => {
    const tags = Array.from({ length: 30 }, (_, i) => `Genre ${i}`)
    const capped = normalizeRecordGenres([" Genre 0 ", "genre 0", ...tags])
    expect(capped).toHaveLength(MAX_RECORD_GENRES)
    expect(capped[0]).toBe("Genre 0")
    expect(capped[1]).toBe("Genre 1")
  })
})

describe("shop physicalMedia stock", () => {
  const shop: ItemShopsShopCatalogEntry = {
    shopId: "honky-tonk",
    name: "Honky Tonk",
    availableItems: [{ shortId: "cd-player", coinValue: 80 }],
    listedBuybackRate: 0.5,
    unlistedBuybackRate: 0.25,
  }

  it("appends only matching records to a shop that declares a carry", () => {
    const stocked = withPhysicalMediaStock(
      { ...shop, physicalMedia: { library: { formats: ["CD"], genres: ["Country"] } } },
      derived,
    )
    expect(ids(stocked.availableItems)).toEqual(["cd-player", "country-cd"])
    expect(stocked.distinctOffers).toBe(true)
  })

  it("leaves a shop whose carry matches nothing as declared", () => {
    const declared = { ...shop, physicalMedia: { library: { genres: ["Polka"] } } }
    expect(withPhysicalMediaStock(declared, derived)).toBe(declared)
  })

  it("leaves a shop without a carry alone", () => {
    expect(withPhysicalMediaStock(shop, derived)).toBe(shop)
  })

  it("stocks Record Store with every record, fixed SKUs, and playlist grant rows", () => {
    const shops = buildEffectiveShopCatalog(
      [{ shortId: "grant-1", scope: "playlist", coinValue: 5 } as never],
      derived,
    )
    const recordStore = shops.find((s) => s.shopId === RECORD_STORE_SHOP_ID)!
    expect(ids(recordStore.availableItems)).toEqual([
      ...RECORD_STORE_FIXED_ITEMS.map((i) => i.shortId),
      "grant-1",
      ...derived.map((e) => e.definition.shortId),
    ])
  })

  it("omits Record Store when nothing is derived", () => {
    expect(buildEffectiveShopCatalog([], []).some((s) => s.shopId === RECORD_STORE_SHOP_ID)).toBe(false)
  })
})
