import { describe, expect, it } from "vitest"
import type { InventoryItem } from "@repo/types"
import {
  artworkFrameForFormat,
  CONDITION_OFFER_WEIGHTS,
  CONDITION_PRICE_MULTIPLIER,
  degradeCondition,
  priceForCondition,
  readItemCondition,
  rollOfferCondition,
} from "./condition"
import {
  BROKEN_MEDIA_BY_FORMAT,
  formatFromArtworkFrame,
} from "../items/shared/brokenMedia"

function itemWithCondition(condition?: unknown): InventoryItem {
  return {
    itemId: "i1",
    definitionId: "item-shops:pm-1",
    sourcePlugin: "item-shops",
    quantity: 1,
    acquiredAt: 1,
    ...(condition !== undefined ? { metadata: { condition } } : {}),
  }
}

describe("readItemCondition / degradeCondition", () => {
  it("defaults absent metadata to mint", () => {
    expect(readItemCondition(itemWithCondition())).toBe("mint")
    expect(readItemCondition(itemWithCondition("nope"))).toBe("mint")
  })

  it("reads stored condition", () => {
    expect(readItemCondition(itemWithCondition("good"))).toBe("good")
    expect(readItemCondition(itemWithCondition("poor"))).toBe("poor")
  })

  it("walks mint → good → poor → null", () => {
    expect(degradeCondition("mint")).toBe("good")
    expect(degradeCondition("good")).toBe("poor")
    expect(degradeCondition("poor")).toBeNull()
  })
})

describe("rollOfferCondition / priceForCondition", () => {
  it("weights mint < good < poor", () => {
    const counts = { mint: 0, good: 0, poor: 0 }
    const seq = [0, 0.14, 0.15, 0.42, 0.43, 0.99]
    let i = 0
    const random = () => seq[i++] ?? 0
    for (let n = 0; n < seq.length; n++) {
      counts[rollOfferCondition(random)]++
    }
    expect(counts.mint).toBe(2)
    expect(counts.good).toBe(2)
    expect(counts.poor).toBe(2)
    expect(CONDITION_OFFER_WEIGHTS.poor).toBeGreaterThan(CONDITION_OFFER_WEIGHTS.good)
    expect(CONDITION_OFFER_WEIGHTS.good).toBeGreaterThan(CONDITION_OFFER_WEIGHTS.mint)
  })

  it("scales price with a floor of 1", () => {
    expect(priceForCondition(20, "mint")).toBe(20)
    expect(priceForCondition(20, "good")).toBe(14)
    expect(priceForCondition(20, "poor")).toBe(9)
    expect(priceForCondition(1, "poor")).toBe(1)
    expect(CONDITION_PRICE_MULTIPLIER.poor).toBeLessThan(CONDITION_PRICE_MULTIPLIER.good)
  })
})

describe("artworkFrameForFormat", () => {
  it("returns the same frame for all three conditions today", () => {
    for (const format of ["CD", "LP", "TAPE", "45"] as const) {
      const mint = artworkFrameForFormat(format, "mint")
      expect(artworkFrameForFormat(format, "good")).toBe(mint)
      expect(artworkFrameForFormat(format, "poor")).toBe(mint)
    }
    expect(artworkFrameForFormat("CD", "mint")).toBe("jewel-case")
    expect(artworkFrameForFormat("LP", "mint")).toBe("record-jacket")
    expect(artworkFrameForFormat("TAPE", "mint")).toBe("cassette-case")
    expect(artworkFrameForFormat("45", "mint")).toBe("die-cut-jacket")
  })
})

describe("BROKEN_MEDIA_BY_FORMAT / formatFromArtworkFrame", () => {
  it("covers all four Physical Media formats", () => {
    expect(BROKEN_MEDIA_BY_FORMAT.CD.shortId).toBe("scratched-cd")
    expect(BROKEN_MEDIA_BY_FORMAT.LP.shortId).toBe("dusty-record")
    expect(BROKEN_MEDIA_BY_FORMAT["45"].shortId).toBe("dusty-record")
    expect(BROKEN_MEDIA_BY_FORMAT.TAPE.shortId).toBe("tangled-tape")
    expect(BROKEN_MEDIA_BY_FORMAT.CD.transitionMessage("Kid A")).toBe("Kid A became scratched!")
    expect(BROKEN_MEDIA_BY_FORMAT.LP.transitionMessage("Loveless")).toBe("Loveless got all dusty!")
    expect(BROKEN_MEDIA_BY_FORMAT.TAPE.transitionMessage("Mix")).toBe("Mix became all tangled up!")
  })

  it("maps legacy artwork frames back to a format", () => {
    expect(formatFromArtworkFrame("jewel-case")).toBe("CD")
    expect(formatFromArtworkFrame("record-jacket")).toBe("LP")
    expect(formatFromArtworkFrame("die-cut-jacket")).toBe("45")
    expect(formatFromArtworkFrame("cassette-case")).toBe("TAPE")
    expect(formatFromArtworkFrame("j-card")).toBe("TAPE")
    expect(formatFromArtworkFrame("nope")).toBeUndefined()
  })
})
