import type { ItemDefinition, ShoppingSessionInstance } from "@repo/types"
import { describe, expect, it } from "vitest"
import { quoteItemShopsSellCoins } from "./itemShopsSellQuote"

const baseInstance = (): ShoppingSessionInstance => ({
  shopId: "test-shop",
  shopName: "Test Shop",
  offers: [],
  openedAt: 0,
  listedBuybackRate: 0.5,
  unlistedBuybackRate: 0.25,
  listedShortIds: ["listed-id", "override-id"],
  listedPriceOverrides: { "override-id": 100 },
})

const def = (partial: Partial<ItemDefinition> & Pick<ItemDefinition, "shortId">): Pick<ItemDefinition, "shortId" | "coinValue"> => ({
  shortId: partial.shortId,
  coinValue: partial.coinValue ?? 80,
})

describe("quoteItemShopsSellCoins", () => {
  it("returns null when buyback rates are missing", () => {
    const inst: ShoppingSessionInstance = {
      ...baseInstance(),
      listedBuybackRate: undefined,
      unlistedBuybackRate: undefined,
    }
    expect(quoteItemShopsSellCoins(inst, def({ shortId: "listed-id" }))).toBeNull()
  })

  it("listed item uses catalog coinValue when no override", () => {
    const inst = baseInstance()
    expect(quoteItemShopsSellCoins(inst, def({ shortId: "listed-id", coinValue: 80 }))).toBe(
      Math.floor(80 * 0.5),
    )
  })

  it("listed item uses listedPriceOverrides when present", () => {
    const inst = baseInstance()
    expect(quoteItemShopsSellCoins(inst, def({ shortId: "override-id", coinValue: 999 }))).toBe(
      Math.floor(100 * 0.5),
    )
  })

  it("unlisted item uses catalog coinValue and unlisted rate", () => {
    const inst = baseInstance()
    expect(quoteItemShopsSellCoins(inst, def({ shortId: "not-listed", coinValue: 80 }))).toBe(
      Math.floor(80 * 0.25),
    )
  })

  it("treats missing listedShortIds as empty (unlisted path)", () => {
    const inst = { ...baseInstance(), listedShortIds: undefined }
    expect(quoteItemShopsSellCoins(inst, def({ shortId: "listed-id", coinValue: 80 }))).toBe(
      Math.floor(80 * 0.25),
    )
  })

  it("returns zero when base is zero", () => {
    const inst = baseInstance()
    expect(quoteItemShopsSellCoins(inst, def({ shortId: "not-listed", coinValue: 0 }))).toBe(0)
  })
})
