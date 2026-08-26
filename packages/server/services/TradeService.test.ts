import { beforeEach, describe, expect, test, vi } from "vitest"
import type { AppContext, GameSession, ItemDefinition, TradeInvite } from "@repo/types"
import { PLAYER_TRANSFER_TTL_MS } from "@repo/types"
import { InventoryService } from "./InventoryService"
import { TradeService } from "./TradeService"
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
}

function makeCtx() {
  const redis = new MemoryRedisClient()
  const context = {
    redis: { pubClient: redis },
    gameSessions: {
      getActiveSession: vi.fn().mockResolvedValue(makeSession()),
      incrementSessionTotal: vi.fn().mockResolvedValue(undefined),
    },
    systemEvents: { emit: vi.fn().mockResolvedValue(undefined) },
  } as unknown as AppContext
  const inventory = new InventoryService(context)
  context.inventory = inventory
  const trades = new TradeService(context)
  return { trades, inventory, context }
}

async function acceptInvite(
  trades: TradeService,
  invite: TradeInvite,
): Promise<string> {
  const started = await trades.respondInvite({
    roomId,
    userId: invite.toUserId,
    inviteId: invite.inviteId,
    accept: true,
  })
  expect(started.success).toBe(true)
  return started.trade!.tradeId
}

describe("TradeService", () => {
  beforeEach(() => vi.clearAllMocks())

  test("full happy path swap", async () => {
    const { trades, inventory } = makeCtx()
    await inventory.registerItemDefinitions(roomId, "item-shops", [potionDef])
    const aItem = await inventory.giveItem(roomId, "a", "item-shops:potion", 2)
    const bItem = await inventory.giveItem(roomId, "b", "item-shops:potion", 1)

    const invited = await trades.invite({ roomId, fromUserId: "a", toUserId: "b" })
    expect(invited.success).toBe(true)
    const tradeId = await acceptInvite(trades, invited.invite!)

    await trades.setOffer({
      roomId,
      userId: "a",
      tradeId,
      items: [{ itemId: aItem!.itemId, quantity: 1 }],
    })
    await trades.setOffer({
      roomId,
      userId: "b",
      tradeId,
      items: [{ itemId: bItem!.itemId, quantity: 1 }],
    })
    await trades.lock({ roomId, userId: "a", tradeId })
    await trades.lock({ roomId, userId: "b", tradeId })
    await trades.confirm({ roomId, userId: "a", tradeId })
    const done = await trades.confirm({ roomId, userId: "b", tradeId })
    expect(done.success).toBe(true)
    expect(done.trade?.status).toBe("completed")

    const aInv = await inventory.getInventory(roomId, "a")
    const bInv = await inventory.getInventory(roomId, "b")
    expect(aInv.items.reduce((s, i) => s + i.quantity, 0)).toBe(2)
    expect(bInv.items.reduce((s, i) => s + i.quantity, 0)).toBe(1)
  })

  test("invite does not occupy byUserKey until accept", async () => {
    const { trades } = makeCtx()
    const invited = await trades.invite({ roomId, fromUserId: "a", toUserId: "b" })
    expect(invited.invite).toBeDefined()
    expect(await trades.getTradeForUser(roomId, "a")).toBeNull()
    expect(await trades.getTradeForUser(roomId, "b")).toBeNull()

    const fromC = await trades.invite({ roomId, fromUserId: "c", toUserId: "b" })
    expect(fromC.success).toBe(true)
    expect((await trades.listIncomingInvites(roomId, "b")).length).toBe(2)
  })

  test("one outgoing invite per sender", async () => {
    const { trades } = makeCtx()
    await trades.invite({ roomId, fromUserId: "a", toUserId: "b" })
    const second = await trades.invite({ roomId, fromUserId: "a", toUserId: "c" })
    expect(second.success).toBe(false)
  })

  test("cannot accept invite when already in active trade", async () => {
    const { trades } = makeCtx()
    const cb = await trades.invite({ roomId, fromUserId: "c", toUserId: "b" })
    expect(cb.success).toBe(true)

    const ab = await trades.invite({ roomId, fromUserId: "a", toUserId: "b" })
    await acceptInvite(trades, ab.invite!)

    const result = await trades.respondInvite({
      roomId,
      userId: "b",
      inviteId: cb.invite!.inviteId,
      accept: true,
    })
    expect(result.success).toBe(false)
  })

  test("expired invite rejected", async () => {
    const { trades, context } = makeCtx()
    const invited = await trades.invite({ roomId, fromUserId: "a", toUserId: "b" })
    const invite = invited.invite!
    invite.createdAt = Date.now() - PLAYER_TRANSFER_TTL_MS - 1
    await context.redis.pubClient.set(
      `room:${roomId}:tradeInvite:${invite.inviteId}`,
      JSON.stringify(invite),
    )
    const result = await trades.respondInvite({
      roomId,
      userId: "b",
      inviteId: invite.inviteId,
      accept: true,
    })
    expect(result.success).toBe(false)
    expect(result.message).toMatch(/expired/i)
  })

  test("empty-empty confirm rejected", async () => {
    const { trades } = makeCtx()
    const invited = await trades.invite({ roomId, fromUserId: "a", toUserId: "b" })
    const tradeId = await acceptInvite(trades, invited.invite!)
    await trades.lock({ roomId, userId: "a", tradeId })
    await trades.lock({ roomId, userId: "b", tradeId })
    await trades.confirm({ roomId, userId: "a", tradeId })
    const result = await trades.confirm({ roomId, userId: "b", tradeId })
    expect(result.success).toBe(false)
    expect(result.message).toMatch(/empty/i)
  })

  test("unlock resets confirms and refunds", async () => {
    const { trades, inventory } = makeCtx()
    await inventory.registerItemDefinitions(roomId, "item-shops", [potionDef])
    const aItem = await inventory.giveItem(roomId, "a", "item-shops:potion", 1)
    const invited = await trades.invite({ roomId, fromUserId: "a", toUserId: "b" })
    const tradeId = await acceptInvite(trades, invited.invite!)
    await trades.setOffer({
      roomId,
      userId: "a",
      tradeId,
      items: [{ itemId: aItem!.itemId, quantity: 1 }],
    })
    await trades.lock({ roomId, userId: "a", tradeId })
    expect((await inventory.getInventory(roomId, "a")).items).toHaveLength(0)
    await trades.unlock({ roomId, userId: "b", tradeId })
    expect((await inventory.getInventory(roomId, "a")).items).toHaveLength(1)
    const trade = await trades.getTrade(roomId, tradeId)
    expect(trade?.participants.a?.locked).toBe(false)
  })

  test("setMessage replaces, clears, and rejects non-participants", async () => {
    const { trades } = makeCtx()
    const invited = await trades.invite({ roomId, fromUserId: "a", toUserId: "b" })
    const tradeId = await acceptInvite(trades, invited.invite!)

    const set = await trades.setMessage({
      roomId,
      userId: "a",
      tradeId,
      message: "  need more coins  ",
    })
    expect(set.success).toBe(true)
    expect(set.trade?.participants.a?.message).toBe("need more coins")

    const replace = await trades.setMessage({
      roomId,
      userId: "a",
      tradeId,
      message: "deal?",
    })
    expect(replace.trade?.participants.a?.message).toBe("deal?")

    const clear = await trades.setMessage({
      roomId,
      userId: "a",
      tradeId,
      message: "   ",
    })
    expect(clear.trade?.participants.a?.message).toBeNull()

    const outsider = await trades.setMessage({
      roomId,
      userId: "c",
      tradeId,
      message: "hi",
    })
    expect(outsider.success).toBe(false)
  })
})
