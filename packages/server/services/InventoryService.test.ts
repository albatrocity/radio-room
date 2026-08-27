import { beforeEach, describe, expect, test, vi } from "vitest"
import type { AppContext, GameSession, InventoryItem, ItemDefinition } from "@repo/types"
import { InventoryService } from "./InventoryService"
import { MemoryRedisClient } from "../test-utils/MemoryRedisClient"

const roomId = "room1"
const userId = "user1"

function makeSession(overrides?: Partial<GameSession["config"]>): GameSession {
  return {
    id: "session1",
    roomId,
    config: {
      maxInventorySlots: 5,
      maxCollectionSlots: 20,
      allowTrading: true,
      ...overrides,
    },
  } as GameSession
}

function makeService(params?: { session?: GameSession | null; items?: InventoryItem[] }) {
  const hGetAll = vi.fn().mockResolvedValue(
    Object.fromEntries((params?.items ?? []).map((item) => [item.itemId, JSON.stringify(item)])),
  )
  const getActiveSession = vi.fn().mockResolvedValue(params?.session ?? null)

  const context = {
    redis: { pubClient: { hGetAll } },
    gameSessions: params?.session === undefined ? undefined : { getActiveSession },
  } as unknown as AppContext

  return { service: new InventoryService(context), hGetAll, getActiveSession }
}

function makeMemoryService(params?: {
  session?: GameSession | null
  allowTrading?: boolean
}) {
  const redis = new MemoryRedisClient()
  const session =
    params?.session === null
      ? null
      : makeSession({
          allowTrading: params?.allowTrading ?? true,
          maxInventorySlots: 2,
          maxCollectionSlots: 5,
          ...(params?.session?.config ?? {}),
        })
  const getActiveSession = vi.fn().mockResolvedValue(session)
  const emit = vi.fn().mockResolvedValue(undefined)
  const incrementSessionTotal = vi.fn().mockResolvedValue(undefined)

  const context = {
    redis: { pubClient: redis },
    gameSessions: {
      getActiveSession,
      incrementSessionTotal,
    },
    systemEvents: { emit },
  } as unknown as AppContext

  return {
    service: new InventoryService(context),
    redis,
    emit,
    getActiveSession,
  }
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
  shortId: "unique-tool",
  name: "Unique Tool",
  description: "One slot each",
  stackable: false,
  maxStack: 1,
  tradeable: true,
  consumable: true,
}

describe("InventoryService.getInventory", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("resolves both slot caps from a single active-session read", async () => {
    const { service, getActiveSession } = makeService({ session: makeSession() })

    await expect(service.getInventory(roomId, userId)).resolves.toEqual({
      userId,
      items: [],
      maxSlots: 5,
      maxCollectionSlots: 20,
    })
    expect(getActiveSession).toHaveBeenCalledTimes(1)
  })

  test("falls back to defaults when there is no active session", async () => {
    const { service, getActiveSession } = makeService({ session: null })

    const inv = await service.getInventory(roomId, userId)
    expect(inv.maxSlots).toBe(3)
    expect(inv.maxCollectionSlots).toBe(12)
    expect(getActiveSession).toHaveBeenCalledTimes(1)
  })

  test("falls back to defaults per cap when the session omits one", async () => {
    const { service } = makeService({
      session: makeSession({ maxCollectionSlots: undefined }),
    })

    const inv = await service.getInventory(roomId, userId)
    expect(inv.maxSlots).toBe(5)
    expect(inv.maxCollectionSlots).toBe(12)
  })

  test("skips the session read entirely without a game session service", async () => {
    const { service } = makeService()

    const inv = await service.getInventory(roomId, userId)
    expect(inv.maxSlots).toBe(3)
    expect(inv.maxCollectionSlots).toBe(12)
  })

  test("parses stored items and skips malformed entries", async () => {
    const item = {
      itemId: "i1",
      definitionId: "d1",
      sourcePlugin: "item-shops",
      quantity: 1,
      acquiredAt: 1,
    } as InventoryItem
    const { service, hGetAll } = makeService({ session: makeSession(), items: [item] })
    hGetAll.mockResolvedValue({ i1: JSON.stringify(item), bad: "{not json" })

    const inv = await service.getInventory(roomId, userId)
    expect(inv.items).toEqual([item])
  })
})

describe("InventoryService.canAccommodateItem + transferItem", () => {
  test("canAccommodateItem allows merge plus a new stack (matches giveItem)", async () => {
    const { service } = makeMemoryService()
    await service.registerItemDefinitions(roomId, "item-shops", [potionDef])
    const given = await service.giveItem(roomId, "a", "item-shops:potion", 3)
    expect(given?.quantity).toBe(3)

    // maxStack 5, merge room 2, need 1 more slot for remaining 5 of qty 7 → fits in 2 slots
    await expect(service.canAccommodateItem(roomId, "a", "item-shops:potion", 7)).resolves.toBe(
      true,
    )
    // qty that needs 2 new stacks beyond merge with only 1 free slot (used=1, cap=2)
    await expect(service.canAccommodateItem(roomId, "a", "item-shops:potion", 12)).resolves.toBe(
      false,
    )
  })

  test("transferItem rejects self-transfer", async () => {
    const { service } = makeMemoryService()
    await service.registerItemDefinitions(roomId, "item-shops", [potionDef])
    const item = await service.giveItem(roomId, "a", "item-shops:potion", 1)
    expect(item).not.toBeNull()
    await expect(
      service.transferItem(roomId, "a", "a", item!.itemId, 1),
    ).resolves.toBe(false)
  })

  test("transferItem leaves sender intact when recipient is full", async () => {
    const { service } = makeMemoryService()
    await service.registerItemDefinitions(roomId, "item-shops", [uniqueDef])
    const fromItem = await service.giveItem(roomId, "from", "item-shops:unique-tool", 1)
    // Fill recipient (cap 2)
    await service.giveItem(roomId, "to", "item-shops:unique-tool", 1)
    await service.giveItem(roomId, "to", "item-shops:unique-tool", 1)

    await expect(
      service.transferItem(roomId, "from", "to", fromItem!.itemId, 1),
    ).resolves.toBe(false)

    const fromInv = await service.getInventory(roomId, "from")
    expect(fromInv.items).toHaveLength(1)
    expect(fromInv.items[0]?.quantity).toBe(1)
  })

  test("concurrent transferItem of the same stack does not double-spend", async () => {
    const { service } = makeMemoryService()
    await service.registerItemDefinitions(roomId, "item-shops", [potionDef])
    const item = await service.giveItem(roomId, "from", "item-shops:potion", 1)
    expect(item).not.toBeNull()

    const results = await Promise.all([
      service.transferItem(roomId, "from", "to1", item!.itemId, 1),
      service.transferItem(roomId, "from", "to2", item!.itemId, 1),
    ])

    expect(results.filter(Boolean)).toHaveLength(1)
    const fromInv = await service.getInventory(roomId, "from")
    expect(fromInv.items).toHaveLength(0)

    const to1 = await service.getInventory(roomId, "to1")
    const to2 = await service.getInventory(roomId, "to2")
    const total =
      to1.items.reduce((s, i) => s + i.quantity, 0) +
      to2.items.reduce((s, i) => s + i.quantity, 0)
    expect(total).toBe(1)
  })

  test("canAccommodateItem does not HGETALL the full definition catalog", async () => {
    const { service, redis } = makeMemoryService()
    await service.registerItemDefinitions(roomId, "item-shops", [potionDef])
    const unused = Array.from({ length: 40 }, (_, i) => ({
      ...uniqueDef,
      shortId: `album-${i}`,
      name: `Album ${i}`,
    }))
    await service.registerItemDefinitions(roomId, "physical-media", unused)
    await service.giveItem(roomId, "a", "item-shops:potion", 1)

    const hGetAll = vi.spyOn(redis, "hGetAll")
    await service.canAccommodateItem(roomId, "a", "item-shops:potion", 1)
    const catalogReads = hGetAll.mock.calls.filter(([key]) =>
      String(key).endsWith("inventory:definitions"),
    )
    expect(catalogReads).toHaveLength(0)
  })

  test("transferItem rejects when allowTrading is false", async () => {
    const { service } = makeMemoryService({ allowTrading: false })
    await service.registerItemDefinitions(roomId, "item-shops", [potionDef])
    const item = await service.giveItem(roomId, "a", "item-shops:potion", 1)
    await expect(service.transferItem(roomId, "a", "b", item!.itemId, 1)).resolves.toBe(false)
  })
})
