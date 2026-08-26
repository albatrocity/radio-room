import { beforeEach, describe, expect, test, vi } from "vitest"
import type { AppContext, GameSession, ItemDefinition } from "@repo/types"
import { GiftService } from "./GiftService"
import { InventoryService } from "./InventoryService"
import { MemoryRedisClient } from "../test-utils/MemoryRedisClient"

const roomId = "room1"

function makeSession(overrides?: Partial<GameSession["config"]>): GameSession {
  return {
    id: "session1",
    roomId,
    config: {
      maxInventorySlots: 3,
      maxCollectionSlots: 5,
      allowTrading: true,
      ...overrides,
    },
  } as GameSession
}

const potionDef: Omit<ItemDefinition, "id" | "sourcePlugin"> = {
  shortId: "potion",
  name: "Potion",
  description: "A potion",
  stackable: true,
  maxStack: 5,
  tradeable: true,
  consumable: true,
  coinValue: 10,
}

const uniqueDef: Omit<ItemDefinition, "id" | "sourcePlugin"> = {
  shortId: "tool",
  name: "Tool",
  description: "Unique",
  stackable: false,
  maxStack: 1,
  tradeable: true,
  consumable: true,
}

function makeCtx(allowTrading = true) {
  const redis = new MemoryRedisClient()
  const getActiveSession = vi.fn().mockResolvedValue(makeSession({ allowTrading }))
  const emit = vi.fn().mockResolvedValue(undefined)
  const context = {
    redis: { pubClient: redis },
    gameSessions: {
      getActiveSession,
      incrementSessionTotal: vi.fn().mockResolvedValue(undefined),
    },
    systemEvents: { emit },
  } as unknown as AppContext
  const inventory = new InventoryService(context)
  context.inventory = inventory
  const gifts = new GiftService(context)
  return { gifts, inventory, emit, redis, context }
}

describe("GiftService", () => {
  beforeEach(() => vi.clearAllMocks())

  test("offer → accept moves item and emits transfer", async () => {
    const { gifts, inventory, emit } = makeCtx()
    await inventory.registerItemDefinitions(roomId, "item-shops", [potionDef])
    const item = await inventory.giveItem(roomId, "a", "item-shops:potion", 2)

    const offered = await gifts.offerGift({
      roomId,
      fromUserId: "a",
      toUserId: "b",
      itemId: item!.itemId,
      quantity: 1,
    })
    expect(offered.success).toBe(true)
    expect((await inventory.getInventory(roomId, "a")).items[0]?.quantity).toBe(1)

    const accepted = await gifts.acceptGift({
      roomId,
      userId: "b",
      offerId: offered.offer!.offerId,
    })
    expect(accepted.success).toBe(true)
    expect((await inventory.getInventory(roomId, "b")).items).toHaveLength(1)
    expect(emit).toHaveBeenCalledWith(
      roomId,
      "INVENTORY_ITEM_TRANSFERRED",
      expect.objectContaining({ fromUserId: "a", toUserId: "b" }),
    )
  })

  test("decline refunds sender", async () => {
    const { gifts, inventory } = makeCtx()
    await inventory.registerItemDefinitions(roomId, "item-shops", [potionDef])
    const item = await inventory.giveItem(roomId, "a", "item-shops:potion", 1)
    const offered = await gifts.offerGift({
      roomId,
      fromUserId: "a",
      toUserId: "b",
      itemId: item!.itemId,
    })
    expect((await inventory.getInventory(roomId, "a")).items).toHaveLength(0)

    const declined = await gifts.declineGift({
      roomId,
      userId: "b",
      offerId: offered.offer!.offerId,
    })
    expect(declined.success).toBe(true)
    expect((await inventory.getInventory(roomId, "a")).items).toHaveLength(1)
  })

  test("accept fails when recipient inventory full but keeps escrow", async () => {
    const { gifts, inventory } = makeCtx()
    await inventory.registerItemDefinitions(roomId, "item-shops", [uniqueDef])
    const item = await inventory.giveItem(roomId, "a", "item-shops:tool", 1)
    await inventory.giveItem(roomId, "b", "item-shops:tool", 1)
    await inventory.giveItem(roomId, "b", "item-shops:tool", 1)
    await inventory.giveItem(roomId, "b", "item-shops:tool", 1)

    const offered = await gifts.offerGift({
      roomId,
      fromUserId: "a",
      toUserId: "b",
      itemId: item!.itemId,
    })
    const accepted = await gifts.acceptGift({
      roomId,
      userId: "b",
      offerId: offered.offer!.offerId,
    })
    expect(accepted.success).toBe(false)
    expect(accepted.message).toMatch(/slot/i)
    // Still pending
    expect(await gifts.getOffer(roomId, offered.offer!.offerId)).not.toBeNull()
  })

  test("rejects when allowTrading is false", async () => {
    const { gifts, inventory } = makeCtx(false)
    await inventory.registerItemDefinitions(roomId, "item-shops", [potionDef])
    const item = await inventory.giveItem(roomId, "a", "item-shops:potion", 1)
    const offered = await gifts.offerGift({
      roomId,
      fromUserId: "a",
      toUserId: "b",
      itemId: item!.itemId,
    })
    expect(offered.success).toBe(false)
  })

  test("cancelAllForRoom refunds", async () => {
    const { gifts, inventory } = makeCtx()
    await inventory.registerItemDefinitions(roomId, "item-shops", [potionDef])
    const item = await inventory.giveItem(roomId, "a", "item-shops:potion", 1)
    await gifts.offerGift({
      roomId,
      fromUserId: "a",
      toUserId: "b",
      itemId: item!.itemId,
    })
    await gifts.cancelAllForRoom(roomId)
    expect((await inventory.getInventory(roomId, "a")).items).toHaveLength(1)
  })
})
