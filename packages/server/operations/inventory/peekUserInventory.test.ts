import { beforeEach, describe, expect, test, vi } from "vitest"
import type { AppContext, GameSession, ItemDefinition } from "@repo/types"
import { InventoryService } from "../../services/InventoryService"
import { MemoryRedisClient } from "../../test-utils/MemoryRedisClient"
import { canPeekUserInventory, peekUserInventory } from "./peekUserInventory"

const roomId = "room1"

function makeSession(allowTrading = false): GameSession {
  return {
    id: "session1",
    roomId,
    config: {
      maxInventorySlots: 5,
      maxCollectionSlots: 5,
      maxPlaybackSlots: 2,
      allowTrading,
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
  rarity: "common",
  icon: "FlaskConical",
}

const blackBagDef: Omit<ItemDefinition, "id" | "sourcePlugin"> = {
  shortId: "black-bag",
  name: "Black Bag",
  description: "Steal",
  stackable: false,
  maxStack: 1,
  tradeable: true,
  consumable: true,
  requiresTarget: "userInventoryItem",
  rarity: "legendary",
  icon: "PaperBag",
}

const albumDef: Omit<ItemDefinition, "id" | "sourcePlugin"> = {
  shortId: "album-1",
  name: "Album",
  description: "A record",
  stackable: false,
  maxStack: 1,
  tradeable: true,
  consumable: false,
  slotPool: "collection",
  rarity: "rare",
  icon: "Disc3",
}

function makeCtx(allowTrading = false) {
  const redis = new MemoryRedisClient()
  const context = {
    redis: { pubClient: redis },
    gameSessions: {
      getActiveSession: vi.fn().mockResolvedValue(makeSession(allowTrading)),
      getUserState: vi.fn().mockResolvedValue({
        userId: "a",
        attributes: {},
        modifiers: [],
      }),
      incrementSessionTotal: vi.fn().mockResolvedValue(undefined),
    },
    systemEvents: { emit: vi.fn().mockResolvedValue(undefined) },
  } as unknown as AppContext
  const inventory = new InventoryService(context)
  context.inventory = inventory
  return { inventory, context, redis }
}

async function markOnline(redis: MemoryRedisClient, userId: string) {
  await redis.sAdd(`room:${roomId}:online_users`, userId)
}

describe("canPeekUserInventory / peekUserInventory", () => {
  beforeEach(() => vi.clearAllMocks())

  test("denies when trading is off and no itemId", async () => {
    const { context, redis } = makeCtx(false)
    await markOnline(redis, "b")
    const result = await canPeekUserInventory({
      roomId,
      actorUserId: "a",
      targetUserId: "b",
      context,
    })
    expect(result).toEqual({ ok: false, message: "Inventory peek is not allowed" })
  })

  test("denies self-peek", async () => {
    const { context } = makeCtx(true)
    const result = await canPeekUserInventory({
      roomId,
      actorUserId: "a",
      targetUserId: "a",
      context,
    })
    expect(result).toEqual({ ok: false, message: "Cannot peek your own inventory" })
  })

  test("denies when target is not in room", async () => {
    const { context } = makeCtx(true)
    const result = await canPeekUserInventory({
      roomId,
      actorUserId: "a",
      targetUserId: "b",
      context,
    })
    expect(result).toEqual({ ok: false, message: "That user is not in this room" })
  })

  test("allows when allowTrading is true", async () => {
    const { context, redis } = makeCtx(true)
    await markOnline(redis, "b")
    const getInventory = vi.spyOn(context.inventory!, "getInventory")
    const result = await canPeekUserInventory({
      roomId,
      actorUserId: "a",
      targetUserId: "b",
      context,
    })
    expect(result).toEqual({ ok: true, reason: "allow_trading" })
    expect(context.gameSessions!.getUserState).not.toHaveBeenCalled()
    expect(getInventory).not.toHaveBeenCalled()
  })

  test("allows with userInventoryItem item when trading is off", async () => {
    const { inventory, context, redis } = makeCtx(false)
    await markOnline(redis, "b")
    await inventory.registerItemDefinitions(roomId, "item-shops", [blackBagDef])
    const bag = await inventory.giveItem(roomId, "a", "item-shops:black-bag", 1)
    expect(bag).toBeTruthy()

    const result = await canPeekUserInventory({
      roomId,
      actorUserId: "a",
      targetUserId: "b",
      itemId: bag!.itemId,
      context,
    })
    expect(result).toEqual({ ok: true, reason: "item_use" })
  })

  test("allows with inventory_peek flag and no itemId", async () => {
    const { context, redis } = makeCtx(false)
    await markOnline(redis, "b")
    const now = Date.now()
    vi.mocked(context.gameSessions!.getUserState).mockResolvedValue({
      userId: "a",
      attributes: { score: 0, coin: 0 },
      modifiers: [
        {
          id: "m1",
          name: "x-ray",
          source: "item-shops",
          stackBehavior: "stack",
          startAt: now - 1000,
          endAt: now + 60_000,
          effects: [{ type: "flag", name: "inventory_peek", value: true }],
        },
      ],
    })

    const getInventory = vi.spyOn(context.inventory!, "getInventory")
    const result = await canPeekUserInventory({
      roomId,
      actorUserId: "a",
      targetUserId: "b",
      context,
    })
    expect(result).toEqual({ ok: true, reason: "inventory_peek" })
    expect(getInventory).not.toHaveBeenCalled()
    // The session is resolved once for the whole check and handed to
    // `getUserState`, which would otherwise re-read it (two `GET`s, not four).
    // `gameSessions` is mocked here, so the handed-over session is the pin.
    expect(context.gameSessions!.getActiveSession).toHaveBeenCalledTimes(1)
    expect(context.gameSessions!.getUserState).toHaveBeenCalledWith(
      roomId,
      "a",
      expect.objectContaining({ id: "session1" }),
    )
  })

  test("denies when inventory_peek flag is expired", async () => {
    const { context, redis } = makeCtx(false)
    await markOnline(redis, "b")
    const now = Date.now()
    vi.mocked(context.gameSessions!.getUserState).mockResolvedValue({
      userId: "a",
      attributes: { score: 0, coin: 0 },
      modifiers: [
        {
          id: "m1",
          name: "x-ray",
          source: "item-shops",
          stackBehavior: "stack",
          startAt: now - 120_000,
          endAt: now - 1000,
          effects: [{ type: "flag", name: "inventory_peek", value: true }],
        },
      ],
    })

    const result = await canPeekUserInventory({
      roomId,
      actorUserId: "a",
      targetUserId: "b",
      context,
    })
    expect(result).toEqual({ ok: false, message: "Inventory peek is not allowed" })
  })

  test("denies itemId that is not userInventoryItem", async () => {
    const { inventory, context, redis } = makeCtx(false)
    await markOnline(redis, "b")
    await inventory.registerItemDefinitions(roomId, "item-shops", [potionDef])
    const potion = await inventory.giveItem(roomId, "a", "item-shops:potion", 1)

    const result = await canPeekUserInventory({
      roomId,
      actorUserId: "a",
      targetUserId: "b",
      itemId: potion!.itemId,
      context,
    })
    expect(result).toEqual({ ok: false, message: "Inventory peek is not allowed" })
  })

  test("peek returns both pools with hydrated fields and omits metadata", async () => {
    const { inventory, context, redis } = makeCtx(true)
    await markOnline(redis, "b")
    await inventory.registerItemDefinitions(roomId, "item-shops", [potionDef, albumDef])
    await inventory.giveItem(roomId, "b", "item-shops:potion", 2, { secret: true })
    await inventory.giveItem(roomId, "b", "item-shops:album-1", 1)

    const result = await peekUserInventory({
      roomId,
      actorUserId: "a",
      targetUserId: "b",
      context,
    })

    expect(result.success).toBe(true)
    expect(result.targetUserId).toBe("b")
    expect(result.items).toHaveLength(2)

    const potion = result.items!.find((i) => i.shortId === "potion")
    const album = result.items!.find((i) => i.shortId === "album-1")
    expect(potion).toMatchObject({
      name: "Potion",
      quantity: 2,
      slotPool: "inventory",
      tradeable: true,
      rarity: "common",
      icon: "FlaskConical",
    })
    expect(album).toMatchObject({
      name: "Album",
      slotPool: "collection",
      rarity: "rare",
    })
    expect(potion).not.toHaveProperty("metadata")
    expect(JSON.stringify(result)).not.toContain("secret")
  })

  test("peek fails when no session", async () => {
    const { context, redis } = makeCtx(true)
    await markOnline(redis, "b")
    vi.mocked(context.gameSessions!.getActiveSession).mockResolvedValue(null)

    const result = await peekUserInventory({
      roomId,
      actorUserId: "a",
      targetUserId: "b",
      context,
    })
    expect(result.success).toBe(false)
    expect(result.message).toContain("No active game session")
  })
})
