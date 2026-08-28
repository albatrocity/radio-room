import { beforeEach, describe, expect, test, vi } from "vitest"
import type { AppContext } from "@repo/types"
import { makeSocketWithBroadcastMocks } from "../lib/testHelpers"
import { createGiftTradeHandlers } from "./giftTradeHandlersAdapter"

const giftMocks = vi.hoisted(() => ({
  offerGift: vi.fn(),
  acceptGift: vi.fn(),
  declineGift: vi.fn(),
  cancelGift: vi.fn(),
}))

const tradeMocks = vi.hoisted(() => ({
  tradeInvite: vi.fn(),
  tradeRespond: vi.fn(),
  tradeSetOffer: vi.fn(),
  tradeSetMessage: vi.fn(),
  tradeTyping: vi.fn(),
  tradeLock: vi.fn(),
  tradeUnlock: vi.fn(),
  tradeConfirm: vi.fn(),
  tradeCancel: vi.fn(),
}))

const emitMocks = vi.hoisted(() => ({
  emitToUserSocket: vi.fn(),
}))

vi.mock("../operations/inventory/giftOps", () => giftMocks)
vi.mock("../operations/inventory/tradeOps", () => tradeMocks)
vi.mock("../lib/emitToUserSocket", () => emitMocks)

describe("GiftTradeHandlers", () => {
  const context = {} as AppContext
  const handlers = createGiftTradeHandlers(context)
  let connections: ReturnType<typeof makeSocketWithBroadcastMocks>
  let socket: ReturnType<typeof makeSocketWithBroadcastMocks>["socket"]

  beforeEach(() => {
    vi.resetAllMocks()
    connections = makeSocketWithBroadcastMocks({
      roomId: "room123",
      userId: "user123",
    })
    socket = connections.socket
  })

  test("should be defined", () => {
    expect(handlers).toBeDefined()
  })

  test("offerGift rejects missing fields without calling the operation", async () => {
    await handlers.offerGift(connections, { itemId: "i1" })
    expect(giftMocks.offerGift).not.toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith("event", {
      type: "GIFT_ACTION_RESULT",
      data: { success: false, message: "Missing itemId or toUserId" },
    })
  })

  test("offerGift calls the operation and emits GIFT_ACTION_RESULT", async () => {
    giftMocks.offerGift.mockResolvedValue({
      success: true,
      message: "ok",
      offer: { offerId: "g1" },
    })
    await handlers.offerGift(connections, { itemId: "i1", toUserId: "b", quantity: 2 })
    expect(giftMocks.offerGift).toHaveBeenCalledWith({
      roomId: "room123",
      fromUserId: "user123",
      toUserId: "b",
      itemId: "i1",
      quantity: 2,
      context,
    })
    expect(socket.emit).toHaveBeenCalledWith("event", {
      type: "GIFT_ACTION_RESULT",
      data: { success: true, message: "ok", offerId: "g1" },
    })
  })

  test("acceptGift calls the operation", async () => {
    giftMocks.acceptGift.mockResolvedValue({
      success: true,
      offer: { offerId: "g1" },
    })
    await handlers.acceptGift(connections, { offerId: "g1" })
    expect(giftMocks.acceptGift).toHaveBeenCalledWith({
      roomId: "room123",
      userId: "user123",
      offerId: "g1",
      context,
    })
  })

  test("tradeInvite rejects missing toUserId", async () => {
    await handlers.tradeInvite(connections, {})
    expect(tradeMocks.tradeInvite).not.toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith("event", {
      type: "TRADE_ACTION_RESULT",
      data: { success: false, message: "Missing toUserId" },
    })
  })

  test("tradeInvite calls the operation and emits TRADE_ACTION_RESULT", async () => {
    tradeMocks.tradeInvite.mockResolvedValue({
      success: true,
      invite: { inviteId: "inv1" },
    })
    await handlers.tradeInvite(connections, { toUserId: "b" })
    expect(tradeMocks.tradeInvite).toHaveBeenCalledWith({
      roomId: "room123",
      fromUserId: "user123",
      toUserId: "b",
      context,
    })
    expect(socket.emit).toHaveBeenCalledWith("event", {
      type: "TRADE_ACTION_RESULT",
      data: { success: true, message: undefined, tradeId: "inv1" },
    })
  })

  test("tradeConfirm calls the operation", async () => {
    tradeMocks.tradeConfirm.mockResolvedValue({ success: true, trade: { tradeId: "t1" } })
    await handlers.tradeConfirm(connections, { tradeId: "t1" })
    expect(tradeMocks.tradeConfirm).toHaveBeenCalledWith({
      roomId: "room123",
      userId: "user123",
      tradeId: "t1",
      context,
    })
  })

  test("tradeTyping emits TRADE_TYPING to the counterpart socket", async () => {
    tradeMocks.tradeTyping.mockResolvedValue({ success: true, counterpartUserId: "b" })
    await handlers.tradeTyping(connections, { tradeId: "t1", typing: true })
    expect(tradeMocks.tradeTyping).toHaveBeenCalledWith({
      roomId: "room123",
      userId: "user123",
      tradeId: "t1",
      context,
    })
    expect(emitMocks.emitToUserSocket).toHaveBeenCalledWith({
      io: connections.io,
      context,
      roomId: "room123",
      userId: "b",
      type: "TRADE_TYPING",
      data: {
        roomId: "room123",
        tradeId: "t1",
        userId: "user123",
        typing: true,
      },
    })
  })

  test("tradeRespond includes the session on TRADE_ACTION_RESULT", async () => {
    const trade = { tradeId: "t1", status: "open" }
    tradeMocks.tradeRespond.mockResolvedValue({
      success: true,
      message: "Trade started",
      trade,
    })
    await handlers.tradeRespond(connections, { tradeId: "inv1", accept: true })
    expect(tradeMocks.tradeRespond).toHaveBeenCalledWith({
      roomId: "room123",
      userId: "user123",
      inviteId: "inv1",
      accept: true,
      context,
    })
    expect(socket.emit).toHaveBeenCalledWith("event", {
      type: "TRADE_ACTION_RESULT",
      data: { success: true, message: "Trade started", tradeId: "t1", trade },
    })
  })
})
