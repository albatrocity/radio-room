import { beforeEach, describe, expect, test, vi } from "vitest"
import type { AppContext, GameSession, ItemDefinition } from "@repo/types"
import { PLAYER_TRANSFER_TTL_MS } from "@repo/types"
import { GiftService } from "../../services/GiftService"
import { InventoryService } from "../../services/InventoryService"
import { MemoryRedisClient } from "../../test-utils/MemoryRedisClient"
import { acceptGift } from "./giftOps"

vi.mock("../data/users", () => ({
  getUser: vi.fn().mockResolvedValue({ username: "Listener" }),
}))
vi.mock("../polls/postSystemChatMessage", () => ({
  postSystemChatMessage: vi.fn().mockResolvedValue(undefined),
}))

const roomId = "room1"

function makeSession(): GameSession {
  return {
    id: "session1",
    roomId,
    config: {
      maxInventorySlots: 3,
      maxCollectionSlots: 5,
      maxPlaybackSlots: 2,
      allowTrading: true,
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

function makeCtx() {
  const redis = new MemoryRedisClient()
  const emit = vi.fn().mockResolvedValue(undefined)
  const context = {
    redis: { pubClient: redis },
    gameSessions: {
      getActiveSession: vi.fn().mockResolvedValue(makeSession()),
      incrementSessionTotal: vi.fn().mockResolvedValue(undefined),
    },
    systemEvents: { emit },
  } as unknown as AppContext
  const inventory = new InventoryService(context)
  context.inventory = inventory
  const gifts = new GiftService(context)
  context.gifts = gifts
  return { gifts, inventory, emit, context }
}

describe("giftOps", () => {
  beforeEach(() => vi.clearAllMocks())

  test("acceptGift emits GIFT_COMPLETED and INVENTORY_ITEM_TRANSFERRED", async () => {
    const { gifts, inventory, emit, context } = makeCtx()
    await inventory.registerItemDefinitions(roomId, "item-shops", [potionDef])
    const item = await inventory.giveItem(roomId, "a", "item-shops:potion", 1)
    const offered = await gifts.offerGift({
      roomId,
      fromUserId: "a",
      toUserId: "b",
      itemId: item!.itemId,
    })

    const result = await acceptGift({
      roomId,
      userId: "b",
      offerId: offered.offer!.offerId,
      context,
    })
    expect(result.success).toBe(true)
    expect(emit).toHaveBeenCalledWith(roomId, "GIFT_COMPLETED", expect.anything())
    expect(emit).toHaveBeenCalledWith(
      roomId,
      "INVENTORY_ITEM_TRANSFERRED",
      expect.objectContaining({ fromUserId: "a", toUserId: "b" }),
    )
  })

  test("acceptGift of a stale offer emits GIFT_CANCELLED ttl", async () => {
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

    const result = await acceptGift({
      roomId,
      userId: "b",
      offerId: offer.offerId,
      context,
    })
    expect(result.success).toBe(false)
    expect(result.expired).toBe(true)
    expect(emit).toHaveBeenCalledWith(
      roomId,
      "GIFT_CANCELLED",
      expect.objectContaining({ reason: "ttl" }),
    )
    expect(emit).not.toHaveBeenCalledWith(
      roomId,
      "INVENTORY_ITEM_TRANSFERRED",
      expect.anything(),
    )
  })
})
