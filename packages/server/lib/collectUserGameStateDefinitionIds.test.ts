import { describe, expect, it } from "vitest"
import {
  collectGiftOfferDefinitionIds,
  collectInventoryAndModifierDefinitionIds,
  collectTradeSessionDefinitionIds,
} from "./collectUserGameStateDefinitionIds"
import type { GiftOffer, TradeSession, UserGameState, UserInventory } from "@repo/types"

describe("collectInventoryAndModifierDefinitionIds", () => {
  it("returns empty for null inventory and state", () => {
    expect(collectInventoryAndModifierDefinitionIds(null, null)).toEqual([])
  })

  it("collects inventory and modifier definition ids", () => {
    const inventory = {
      userId: "u1",
      items: [
        { itemId: "a", definitionId: "item-shops:beer", quantity: 1, acquiredAt: 1 },
        { itemId: "b", definitionId: "item-shops:beer", quantity: 2, acquiredAt: 1 },
        { itemId: "c", definitionId: "item-shops:pm-al-1", quantity: 1, acquiredAt: 1 },
      ],
      maxSlots: 10,
      maxCollectionSlots: 10,
    } as UserInventory
    const state = {
      userId: "u1",
      attributes: {},
      modifiers: [{ id: "m1", itemDefinitionId: "item-shops:buff" }],
    } as unknown as UserGameState

    expect(collectInventoryAndModifierDefinitionIds(inventory, state).sort()).toEqual([
      "item-shops:beer",
      "item-shops:buff",
      "item-shops:pm-al-1",
    ])
  })
})

describe("collectGiftOfferDefinitionIds", () => {
  it("returns unique definition ids from pending offers", () => {
    const offers = [
      { definitionId: "item-shops:beer" },
      { definitionId: "item-shops:beer" },
      { definitionId: " item-shops:pm-al-1 " },
      { definitionId: "" },
    ] as GiftOffer[]
    expect(collectGiftOfferDefinitionIds(offers).sort()).toEqual([
      "item-shops:beer",
      "item-shops:pm-al-1",
    ])
  })
})

describe("collectTradeSessionDefinitionIds", () => {
  it("returns empty for null trade", () => {
    expect(collectTradeSessionDefinitionIds(null)).toEqual([])
    expect(collectTradeSessionDefinitionIds({ tradeId: "t1" } as TradeSession)).toEqual([])
  })

  it("collects draft and offer ids from every participant", () => {
    const trade = {
      participants: {
        a: {
          userId: "a",
          draft: [{ itemId: "i1", quantity: 1, definitionId: "item-shops:lemon", slotPool: "inventory" }],
          offer: [],
          locked: false,
          confirmed: false,
        },
        b: {
          userId: "b",
          draft: [],
          offer: [
            {
              escrowKey: "e1",
              originalItemId: "i2",
              definitionId: "item-shops:cucumber",
              sourcePlugin: "item-shops",
              quantity: 1,
              slotPool: "inventory",
            },
          ],
          locked: true,
          confirmed: false,
        },
      },
    } as unknown as TradeSession
    expect(collectTradeSessionDefinitionIds(trade).sort()).toEqual([
      "item-shops:cucumber",
      "item-shops:lemon",
    ])
  })
})
