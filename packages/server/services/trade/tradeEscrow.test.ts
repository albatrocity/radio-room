import { describe, expect, test, vi } from "vitest"
import type { InventoryItem, ItemDefinition, TradeOfferItem } from "@repo/types"
import { canAccommodateOfferList } from "./tradeEscrow"

const roomId = "room1"

const potion: ItemDefinition = {
  id: "item-shops:potion",
  sourcePlugin: "item-shops",
  shortId: "potion",
  name: "Potion",
  description: "",
  stackable: true,
  maxStack: 5,
  tradeable: true,
  consumable: true,
}

function bagItem(overrides?: Partial<InventoryItem>): InventoryItem {
  return {
    itemId: "i1",
    definitionId: potion.id,
    sourcePlugin: "item-shops",
    quantity: 1,
    acquiredAt: 1,
    ...overrides,
  }
}

describe("canAccommodateOfferList", () => {
  test("loads bag and incoming defs via getItemDefinitions, not the full catalog", async () => {
    const getItemDefinitions = vi.fn(async (_roomId: string, ids: readonly string[]) => {
      expect(ids).toEqual(expect.arrayContaining([potion.id]))
      return [potion]
    })
    const getAllItemDefinitions = vi.fn()
    const getItemDefinition = vi.fn()
    const inventory = {
      getInventory: vi.fn(async () => ({
        userId: "a",
        items: [bagItem()],
        maxSlots: 5,
        maxCollectionSlots: 5,
      })),
      getItemDefinitions,
      getAllItemDefinitions,
      getItemDefinition,
    }

    const incoming: TradeOfferItem[] = [
      {
        escrowKey: "e1",
        originalItemId: "x",
        definitionId: potion.id,
        sourcePlugin: "item-shops",
        quantity: 1,
        slotPool: "inventory",
      },
    ]

    await expect(
      canAccommodateOfferList({
        inventory: inventory as never,
        roomId,
        userId: "a",
        incoming,
      }),
    ).resolves.toBe(true)

    expect(getItemDefinitions).toHaveBeenCalledTimes(1)
    expect(getAllItemDefinitions).not.toHaveBeenCalled()
    expect(getItemDefinition).not.toHaveBeenCalled()
  })
})
