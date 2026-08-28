import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { emitToSocket, subscribeById, unsubscribeById } from "../actors/socketActor"
import { emitTradeInviteRespond } from "./tradeSocketActions"

vi.mock("../actors/socketActor", () => ({
  subscribeById: vi.fn(),
  unsubscribeById: vi.fn(),
  emitToSocket: vi.fn(),
}))

vi.mock("../actors/tradeActor", () => ({
  activateTrade: vi.fn(),
}))

vi.mock("../actors/userGameStateActor", () => ({
  refreshUserGameState: vi.fn(),
}))

vi.mock("./tradeInviteToast", () => ({
  dismissTradeInviteToast: vi.fn(),
}))

vi.mock("./tradesGiftsAttention", () => ({
  clearTradesGiftsTabAttentionIfEmpty: vi.fn(),
}))

vi.mock("../components/ui/toaster", () => ({
  toaster: { create: vi.fn(), dismiss: vi.fn() },
}))

describe("emitTradeInviteRespond", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("emits TRADE_RESPOND only once while a respond for that invite is in flight", () => {
    const params = {
      inviteId: "inv-1",
      fromUserId: "a",
      toUserId: "b",
      accept: true,
    }
    emitTradeInviteRespond(params)
    emitTradeInviteRespond(params)

    expect(emitToSocket).toHaveBeenCalledTimes(1)
    expect(emitToSocket).toHaveBeenCalledWith("TRADE_RESPOND", {
      tradeId: "inv-1",
      accept: true,
    })
    expect(subscribeById).toHaveBeenCalledTimes(1)

    const send = vi.mocked(subscribeById).mock.calls[0]![1].send
    send({ type: "TRADE_ACTION_RESULT", data: { success: true, tradeId: "t1" } })
  })

  it("allows a later respond after the first result settles", () => {
    emitTradeInviteRespond({
      inviteId: "inv-2",
      fromUserId: "a",
      toUserId: "b",
      accept: true,
    })
    const send = vi.mocked(subscribeById).mock.calls[0]![1].send
    send({ type: "TRADE_ACTION_RESULT", data: { success: false, message: "nope" } })
    expect(unsubscribeById).toHaveBeenCalled()

    vi.mocked(emitToSocket).mockClear()
    emitTradeInviteRespond({
      inviteId: "inv-2",
      fromUserId: "a",
      toUserId: "b",
      accept: true,
    })
    expect(emitToSocket).toHaveBeenCalledTimes(1)
  })
})
