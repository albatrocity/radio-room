import { describe, expect, it } from "vitest"
import type { GameStateModifier } from "@repo/types"
import {
  DOUBLE_VOTE_FLAG,
  SHOP_PRICE_ATTRIBUTE,
  activeFlagModifier,
  shopPriceScale,
} from "./itemPerks"
import { applyLiveCostScale } from "./shoppingSessionCatalog"

const now = 10_000

function modifier(effects: GameStateModifier["effects"], overrides?: Partial<GameStateModifier>) {
  return {
    id: "m1",
    name: "test",
    source: "test",
    effects,
    startAt: now - 1,
    endAt: now + 1_000,
    stackBehavior: "replace",
    ...overrides,
  } satisfies GameStateModifier
}

describe("activeFlagModifier", () => {
  it("finds the modifier carrying the flag", () => {
    const pizza = modifier([{ type: "flag", name: DOUBLE_VOTE_FLAG, value: true }])
    expect(activeFlagModifier([pizza], DOUBLE_VOTE_FLAG, now)?.id).toBe("m1")
  })

  it("skips expired modifiers", () => {
    const pizza = modifier([{ type: "flag", name: DOUBLE_VOTE_FLAG, value: true }], {
      endAt: now,
    })
    expect(activeFlagModifier([pizza], DOUBLE_VOTE_FLAG, now)).toBeUndefined()
  })
})

describe("shopPriceScale", () => {
  it("is 1 without a discount", () => {
    expect(shopPriceScale([], now)).toBe(1)
  })

  it("reads the shop price multiplier", () => {
    const book = modifier([{ type: "multiplier", target: SHOP_PRICE_ATTRIBUTE, value: 0.9 }])
    expect(shopPriceScale([book], now)).toBe(0.9)
  })

  it("discounts live offer prices with a floor of 1", () => {
    const instance = {
      shopId: "s",
      shopName: "S",
      openedAt: 0,
      offers: [
        {
          offerId: 0,
          shortId: "a",
          name: "A",
          description: "",
          icon: "Package",
          basePrice: 40,
          price: 40,
          available: true,
          rarity: "common",
        },
        {
          offerId: 1,
          shortId: "b",
          name: "B",
          description: "",
          icon: "Package",
          basePrice: 1,
          price: 1,
          available: true,
          rarity: "common",
        },
      ],
    } as Parameters<typeof applyLiveCostScale>[0]
    const priced = applyLiveCostScale(instance, null, 0.9)
    expect(priced.offers[0]!.price).toBeLessThan(40)
    expect(priced.offers[1]!.price).toBe(1)
  })
})
