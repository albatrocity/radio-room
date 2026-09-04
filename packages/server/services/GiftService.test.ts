import { beforeEach, describe, expect, test, vi } from "vitest"
import type { AppContext, GameSession, ItemDefinition } from "@repo/types"
import { PLAYER_TRANSFER_TTL_MS } from "@repo/types"
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
      maxPlaybackSlots: 2,
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
  context.gifts = gifts
  return { gifts, inventory, emit, redis, context }
}

function transferredCalls(emit: ReturnType<typeof vi.fn>) {
  return emit.mock.calls.filter((c) => c[1] === "INVENTORY_ITEM_TRANSFERRED")
}

describe("GiftService", () => {
  beforeEach(() => vi.clearAllMocks())

  test("offer → accept moves item without emitting transfer from the service", async () => {
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
    expect(transferredCalls(emit)).toHaveLength(0)
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
    expect(accepted.message).toBe("Inventory is full — free a slot to accept this gift.")
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

  test("listing drops expired offers, refunds, and emits GIFT_CANCELLED ttl", async () => {
    const { gifts, inventory, emit, context } = makeCtx()
    await inventory.registerItemDefinitions(roomId, "item-shops", [potionDef])
    const item = await inventory.giveItem(roomId, "a", "item-shops:potion", 1)
    const offered = await gifts.offerGift({
      roomId,
      fromUserId: "a",
      toUserId: "b",
      itemId: item!.itemId,
    })
    const offer = offered.offer!
    offer.createdAt = Date.now() - PLAYER_TRANSFER_TTL_MS - 1
    await context.redis.pubClient.set(
      `room:${roomId}:gift:${offer.offerId}`,
      JSON.stringify(offer),
    )

    const listed = await gifts.listIncoming(roomId, "b")
    expect(listed).toHaveLength(0)
    expect((await inventory.getInventory(roomId, "a")).items).toHaveLength(1)
    expect(emit).toHaveBeenCalledWith(
      roomId,
      "GIFT_CANCELLED",
      expect.objectContaining({
        reason: "ttl",
        offer: expect.objectContaining({ offerId: offer.offerId }),
      }),
    )
  })

  test("accept of an expired offer refunds and returns expired", async () => {
    const { gifts, inventory, emit, context } = makeCtx()
    await inventory.registerItemDefinitions(roomId, "item-shops", [potionDef])
    const item = await inventory.giveItem(roomId, "a", "item-shops:potion", 1)
    const offered = await gifts.offerGift({
      roomId,
      fromUserId: "a",
      toUserId: "b",
      itemId: item!.itemId,
    })
    const offer = offered.offer!
    offer.createdAt = Date.now() - PLAYER_TRANSFER_TTL_MS - 1
    await context.redis.pubClient.set(
      `room:${roomId}:gift:${offer.offerId}`,
      JSON.stringify(offer),
    )

    const accepted = await gifts.acceptGift({
      roomId,
      userId: "b",
      offerId: offer.offerId,
    })
    expect(accepted.success).toBe(false)
    expect(accepted.expired).toBe(true)
    expect((await inventory.getInventory(roomId, "a")).items).toHaveLength(1)
    expect(transferredCalls(emit)).toHaveLength(0)
  })
})
