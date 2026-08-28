import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createActor, type Actor } from "xstate"
import { userGameStateMachine } from "./userGameStateMachine"
import { emitToSocket, subscribeById, unsubscribeById } from "../actors/socketActor"

vi.mock("../actors/socketActor", () => ({
  subscribeById: vi.fn(),
  unsubscribeById: vi.fn(),
  emitToSocket: vi.fn(),
}))
vi.mock("../actors/authActor", () => ({
  getCurrentUser: () => ({ userId: "me" }),
}))

const emptyPayload = {
  session: null,
  state: null,
  inventory: null,
  itemDefinitions: [],
  pluginUserState: {},
}

describe("userGameStateMachine refetch characterization", () => {
  let actor: Actor<typeof userGameStateMachine>

  beforeEach(() => {
    vi.clearAllMocks()
    actor = createActor(userGameStateMachine)
    actor.start()
  })

  afterEach(() => {
    actor.send({ type: "DEACTIVATE" })
    actor.stop()
  })

  function activateReady() {
    actor.send({ type: "ACTIVATE" })
    expect(emitToSocket).toHaveBeenCalledWith("GET_MY_GAME_STATE", {})
    vi.mocked(emitToSocket).mockClear()
    actor.send({ type: "USER_GAME_STATE", data: emptyPayload })
    expect(actor.getSnapshot().value).toBe("ready")
  }

  it("subscribes on ACTIVATE and unsubscribes on DEACTIVATE", () => {
    actor.send({ type: "ACTIVATE" })
    expect(subscribeById).toHaveBeenCalled()
    const subId = vi.mocked(subscribeById).mock.calls[0]![0]
    const opts = vi.mocked(subscribeById).mock.calls[0]![1] as { eventTypes?: string[] }
    expect(opts.eventTypes).toEqual(
      expect.arrayContaining([
        "GIFT_OFFERED",
        "GIFT_COMPLETED",
        "TRADE_UPDATED",
        "TRADE_COMPLETED",
        "TRADE_CANCELLED",
        "TRADE_INVITE_OFFERED",
        "TRADE_INVITE_DECLINED",
        "TRADE_INVITE_CANCELLED",
        "TRADE_INVITE_EXPIRED",
        "GAME_SESSION_CONFIG_UPDATED",
      ]),
    )
    actor.send({ type: "DEACTIVATE" })
    expect(unsubscribeById).toHaveBeenCalledWith(subId)
    expect(actor.getSnapshot().value).toBe("idle")
  })

  it("stores USER_GAME_STATE payload", () => {
    activateReady()
    actor.send({
      type: "USER_GAME_STATE",
      data: {
        ...emptyPayload,
        session: { id: "s1" } as any,
        pluginUserState: { "item-shops": { currentShopInstance: null } },
      },
    })
    expect(actor.getSnapshot().context.payload?.session).toEqual({ id: "s1" })
    expect(actor.getSnapshot().context.payload?.pluginUserState?.["item-shops"]).toEqual({
      currentShopInstance: null,
    })
  })

  it("clears payload on GAME_SESSION_ENDED", () => {
    activateReady()
    actor.send({
      type: "USER_GAME_STATE",
      data: { ...emptyPayload, session: { id: "s1" } as any },
    })
    actor.send({ type: "GAME_SESSION_ENDED", data: {} })
    expect(actor.getSnapshot().context.payload?.session).toBeNull()
    expect(actor.getSnapshot().context.storedArtifacts).toEqual([])
  })

  it("fetches and stores artifacts when a session is present", () => {
    activateReady()
    vi.mocked(emitToSocket).mockClear()
    actor.send({
      type: "USER_GAME_STATE",
      data: { ...emptyPayload, session: { id: "s1" } as any },
    })
    expect(emitToSocket).toHaveBeenCalledWith("GET_STORED_ARTIFACTS", {})
    actor.send({
      type: "STORED_ARTIFACTS_RESULT",
      data: { artifacts: [{ id: "a1" }] as never },
    })
    expect(actor.getSnapshot().context.storedArtifacts).toEqual([{ id: "a1" }])
  })

  it("collapses the current user's own inventory burst into one refetch", async () => {
    vi.useFakeTimers()
    try {
      activateReady()
      vi.mocked(emitToSocket).mockClear()

      actor.send({ type: "INVENTORY_ITEM_ACQUIRED", data: { userId: "me" } })
      actor.send({ type: "INVENTORY_ITEM_USED", data: { userId: "me" } })
      actor.send({ type: "GAME_STATE_CHANGED", data: { userId: "me" } })
      expect(emitToSocket).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(200)
      expect(emitToSocket).toHaveBeenCalledTimes(1)
      expect(emitToSocket).toHaveBeenCalledWith("GET_MY_GAME_STATE", {})
    } finally {
      actor.send({ type: "DEACTIVATE" })
      await vi.runOnlyPendingTimersAsync()
      vi.useRealTimers()
    }
  })

  it("ignores game and inventory events for other users", async () => {
    vi.useFakeTimers()
    try {
      activateReady()
      vi.mocked(emitToSocket).mockClear()

      actor.send({ type: "INVENTORY_ITEM_ACQUIRED", data: { userId: "someone-else" } })
      actor.send({ type: "GAME_MODIFIER_APPLIED", data: { userId: "someone-else" } })
      actor.send({
        type: "INVENTORY_ITEM_TRANSFERRED",
        data: { fromUserId: "someone-else", toUserId: "a-third-party" },
      })

      await vi.advanceTimersByTimeAsync(200)
      expect(emitToSocket).not.toHaveBeenCalled()
    } finally {
      actor.send({ type: "DEACTIVATE" })
      await vi.runOnlyPendingTimersAsync()
      vi.useRealTimers()
    }
  })

  it("does not refetch GET_MY_GAME_STATE for other users' gift and trade events", async () => {
    vi.useFakeTimers()
    try {
      activateReady()
      vi.mocked(emitToSocket).mockClear()

      actor.send({
        type: "GIFT_OFFERED",
        data: { offer: { fromUserId: "a", toUserId: "b" } },
      })
      actor.send({
        type: "TRADE_UPDATED",
        data: {
          trade: {
            tradeId: "t1",
            roomId: "r1",
            status: "open",
            fromUserId: "a",
            toUserId: "b",
            createdAt: 1,
            updatedAt: 1,
            participants: {
              a: { userId: "a", draft: [], offer: [], locked: false, confirmed: false },
              b: { userId: "b", draft: [], offer: [], locked: false, confirmed: false },
            },
          },
        },
      })
      actor.send({
        type: "TRADE_INVITE_OFFERED",
        data: { invite: { fromUserId: "a", toUserId: "b" } },
      })

      await vi.advanceTimersByTimeAsync(200)
      expect(emitToSocket).not.toHaveBeenCalled()
    } finally {
      actor.send({ type: "DEACTIVATE" })
      await vi.runOnlyPendingTimersAsync()
      vi.useRealTimers()
    }
  })

  it("patches activeTrade from TRADE_UPDATED without refetching for draft edits", async () => {
    vi.useFakeTimers()
    try {
      activateReady()
      const trade = {
        tradeId: "t1",
        roomId: "r1",
        status: "open" as const,
        fromUserId: "me",
        toUserId: "b",
        createdAt: 1,
        updatedAt: 1,
        participants: {
          me: { userId: "me", draft: [], offer: [], locked: false, confirmed: false },
          b: { userId: "b", draft: [], offer: [], locked: false, confirmed: false },
        },
      }
      actor.send({
        type: "USER_GAME_STATE",
        data: {
          ...emptyPayload,
          itemDefinitions: [{ id: "d" } as never],
          activeTrade: trade,
        },
      })
      vi.mocked(emitToSocket).mockClear()

      const next = {
        ...trade,
        updatedAt: 2,
        participants: {
          ...trade.participants,
          me: {
            ...trade.participants.me,
            draft: [{ itemId: "i1", quantity: 1, definitionId: "d", slotPool: "inventory" as const }],
          },
        },
      }
      actor.send({ type: "TRADE_UPDATED", data: { trade: next } })

      await vi.advanceTimersByTimeAsync(200)
      expect(emitToSocket).not.toHaveBeenCalled()
      expect(actor.getSnapshot().context.payload?.activeTrade?.updatedAt).toBe(2)
    } finally {
      actor.send({ type: "DEACTIVATE" })
      await vi.runOnlyPendingTimersAsync()
      vi.useRealTimers()
    }
  })

  it("refetches when TRADE_UPDATED introduces an unknown counterpart SKU", async () => {
    vi.useFakeTimers()
    try {
      activateReady()
      const trade = {
        tradeId: "t1",
        roomId: "r1",
        status: "open" as const,
        fromUserId: "me",
        toUserId: "b",
        createdAt: 1,
        updatedAt: 1,
        participants: {
          me: { userId: "me", draft: [], offer: [], locked: false, confirmed: false },
          b: { userId: "b", draft: [], offer: [], locked: false, confirmed: false },
        },
      }
      actor.send({
        type: "USER_GAME_STATE",
        data: { ...emptyPayload, activeTrade: trade },
      })
      vi.mocked(emitToSocket).mockClear()

      actor.send({
        type: "TRADE_UPDATED",
        data: {
          trade: {
            ...trade,
            updatedAt: 2,
            participants: {
              ...trade.participants,
              b: {
                ...trade.participants.b,
                draft: [
                  {
                    itemId: "i2",
                    quantity: 1,
                    definitionId: "item-shops:their-lp",
                    slotPool: "inventory" as const,
                  },
                ],
              },
            },
          },
        },
      })

      await vi.advanceTimersByTimeAsync(200)
      expect(emitToSocket).toHaveBeenCalledWith("GET_MY_GAME_STATE", {})
    } finally {
      actor.send({ type: "DEACTIVATE" })
      await vi.runOnlyPendingTimersAsync()
      vi.useRealTimers()
    }
  })

  it("refetches when TRADE_UPDATED locks escrow for the current user", async () => {
    vi.useFakeTimers()
    try {
      activateReady()
      const trade = {
        tradeId: "t1",
        roomId: "r1",
        status: "open" as const,
        fromUserId: "me",
        toUserId: "b",
        createdAt: 1,
        updatedAt: 1,
        participants: {
          me: { userId: "me", draft: [], offer: [], locked: false, confirmed: false },
          b: { userId: "b", draft: [], offer: [], locked: false, confirmed: false },
        },
      }
      actor.send({
        type: "USER_GAME_STATE",
        data: { ...emptyPayload, activeTrade: trade },
      })
      vi.mocked(emitToSocket).mockClear()

      actor.send({
        type: "TRADE_UPDATED",
        data: {
          trade: {
            ...trade,
            participants: {
              ...trade.participants,
              me: {
                ...trade.participants.me,
                locked: true,
                offer: [
                  {
                    escrowKey: "e",
                    originalItemId: "i1",
                    definitionId: "d",
                    sourcePlugin: "p",
                    quantity: 1,
                    slotPool: "inventory" as const,
                  },
                ],
              },
            },
          },
        },
      })

      await vi.advanceTimersByTimeAsync(200)
      expect(emitToSocket).toHaveBeenCalledWith("GET_MY_GAME_STATE", {})
    } finally {
      actor.send({ type: "DEACTIVATE" })
      await vi.runOnlyPendingTimersAsync()
      vi.useRealTimers()
    }
  })

  it("refetches on USER_GAME_STATE_INVALIDATED (debounced)", async () => {
    vi.useFakeTimers()
    try {
      activateReady()
      vi.mocked(emitToSocket).mockClear()

      actor.send({
        type: "USER_GAME_STATE_INVALIDATED",
        data: { roomId: "r1", pluginName: "item-shops" },
      })
      actor.send({
        type: "USER_GAME_STATE_INVALIDATED",
        data: { roomId: "r1", pluginName: "playlist-bingo" },
      })
      expect(emitToSocket).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(200)
      expect(emitToSocket).toHaveBeenCalledTimes(1)
      expect(emitToSocket).toHaveBeenCalledWith("GET_MY_GAME_STATE", {})
    } finally {
      // Flush any pending debounce before restoring real timers.
      actor.send({ type: "DEACTIVATE" })
      await vi.runOnlyPendingTimersAsync()
      vi.useRealTimers()
    }
  })
})
