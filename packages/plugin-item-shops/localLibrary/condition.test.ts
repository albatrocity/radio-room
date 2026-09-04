import { describe, expect, it } from "vitest"
import type { InventoryItem } from "@repo/types"
import {
  artworkFrameForFormat,
  CONDITION_OFFER_WEIGHTS,
  CONDITION_PRICE_MULTIPLIER,
  conditionsWithinBounds,
  degradeCondition,
  isMediaConditionDegraded,
  isMediaConditionImproved,
  priceForCondition,
  readItemCondition,
  readOfferConditionBounds,
  restoreCondition,
  rollOfferCondition,
} from "./condition"
import {
  BROKEN_MEDIA_BY_FORMAT,
  FORMATS_BY_BROKEN_SHORT_ID,
  formatFromArtworkFrame,
  isBrokenMediaShortId,
} from "../items/shared/brokenMedia"
import { MEDIA_CONDITIONS } from "@repo/types"

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

  it("walks poor → good → mint → null", () => {
    expect(restoreCondition("poor")).toBe("good")
    expect(restoreCondition("good")).toBe("mint")
    expect(restoreCondition("mint")).toBeNull()
  })

  it("treats degrade and restore as inverses across MEDIA_CONDITIONS", () => {
    for (const condition of MEDIA_CONDITIONS) {
      const worse = degradeCondition(condition)
      if (worse) expect(restoreCondition(worse)).toBe(condition)
      const better = restoreCondition(condition)
      if (better) expect(degradeCondition(better)).toBe(condition)
    }
  })

  it("isMediaConditionDegraded matches the wear ladder", () => {
    expect(isMediaConditionDegraded("mint", "good")).toBe(true)
    expect(isMediaConditionDegraded("good", "poor")).toBe(true)
    expect(isMediaConditionDegraded("poor", null)).toBe(true)
    expect(isMediaConditionDegraded("poor", "good")).toBe(false)
    expect(isMediaConditionDegraded("mint", "mint")).toBe(false)
  })

  it("isMediaConditionImproved matches the restore ladder", () => {
    expect(isMediaConditionImproved("poor", "good")).toBe(true)
    expect(isMediaConditionImproved("good", "mint")).toBe(true)
    expect(isMediaConditionImproved("mint", "good")).toBe(false)
    expect(isMediaConditionImproved("poor", "poor")).toBe(false)
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

describe("conditionsWithinBounds / readOfferConditionBounds", () => {
  it("defaults to the full Poor–Mint ladder", () => {
    expect(conditionsWithinBounds()).toEqual(["mint", "good", "poor"])
    expect(readOfferConditionBounds({})).toEqual({ min: "poor", max: "mint" })
  })

  it("keeps a single-condition range", () => {
    expect(conditionsWithinBounds("good", "good")).toEqual(["good"])
    expect(conditionsWithinBounds("mint", "mint")).toEqual(["mint"])
  })

  it("treats an inverted pair as the same closed interval", () => {
    expect(conditionsWithinBounds("mint", "poor")).toEqual(["mint", "good", "poor"])
    expect(conditionsWithinBounds("good", "mint")).toEqual(["mint", "good"])
  })

  it("falls back to defaults for unknown stored values", () => {
    expect(readOfferConditionBounds({ offerConditionMin: "nope", offerConditionMax: 3 })).toEqual({
      min: "poor",
      max: "mint",
    })
  })
})

describe("rollOfferCondition bounds", () => {
  it("always returns the only allowed condition", () => {
    const random = () => 0.99
    expect(rollOfferCondition(random, { min: "mint", max: "mint" })).toBe("mint")
    expect(rollOfferCondition(random, { min: "poor", max: "poor" })).toBe("poor")
  })

  it("does not roll Poor when the range is Mint–Good", () => {
    for (const r of [0, 0.5, 0.99]) {
      const rolled = rollOfferCondition(() => r, { min: "good", max: "mint" })
      expect(rolled === "mint" || rolled === "good").toBe(true)
    }
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
    expect(FORMATS_BY_BROKEN_SHORT_ID["scratched-cd"]).toEqual(["CD"])
    expect(FORMATS_BY_BROKEN_SHORT_ID["dusty-record"]).toEqual(["LP", "45"])
    expect(FORMATS_BY_BROKEN_SHORT_ID["tangled-tape"]).toEqual(["TAPE"])
    expect(isBrokenMediaShortId("scratched-cd")).toBe(true)
    expect(isBrokenMediaShortId("boost-pedal")).toBe(false)
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
