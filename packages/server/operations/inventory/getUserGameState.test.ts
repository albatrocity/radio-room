import { describe, expect, test, vi } from "vitest"
import type { AppContext } from "@repo/types"
import { getUserGameState } from "./getUserGameState"

describe("getUserGameState", () => {
  test("returns empty payload when there is no active session", async () => {
    const context = {
      gameSessions: {
        getActiveSession: vi.fn().mockResolvedValue(null),
      },
    } as unknown as AppContext

    await expect(
      getUserGameState({ context, roomId: "room1", userId: "u1" }),
    ).resolves.toMatchObject({
      session: null,
      state: null,
      inventory: null,
      itemDefinitions: [],
    })
  })

  test("includes pending gifts, trade invites, and active trade", async () => {
    const incomingGift = { offerId: "g1" }
    const outgoingInvite = { inviteId: "i1" }
    const trade = { tradeId: "t1" }
    const gifts = {
      listIncoming: vi.fn().mockResolvedValue([incomingGift]),
      listOutgoing: vi.fn().mockResolvedValue([]),
    }
    const trades = {
      listIncomingInvites: vi.fn().mockResolvedValue([]),
      listOutgoingInvites: vi.fn().mockResolvedValue([outgoingInvite]),
      getTradeForUser: vi.fn().mockResolvedValue(trade),
    }
    const context = {
      gameSessions: {
        getActiveSession: vi.fn().mockResolvedValue({ id: "s1", config: { allowTrading: true } }),
        getUserState: vi.fn().mockResolvedValue({ coins: 3, modifiers: [] }),
      },
      inventory: {
        getInventory: vi.fn().mockResolvedValue({ items: [] }),
        getItemDefinitions: vi.fn().mockResolvedValue([]),
      },
      gifts,
      trades,
    } as unknown as AppContext

    const data = await getUserGameState({ context, roomId: "room1", userId: "u1" })
    expect(data.pendingGifts).toEqual({ incoming: [incomingGift], outgoing: [] })
    expect(data.pendingTradeInvites).toEqual({ incoming: [], outgoing: [outgoingInvite] })
    expect(data.activeTrade).toEqual(trade)
  })

  test("includes pending gift definition ids when loading itemDefinitions", async () => {
    const incomingGift = { offerId: "g1", definitionId: "item-shops:gifted-lp" }
    const getItemDefinitions = vi.fn().mockResolvedValue([])
    const context = {
      gameSessions: {
        getActiveSession: vi.fn().mockResolvedValue({ id: "s1", config: { allowTrading: true } }),
        getUserState: vi.fn().mockResolvedValue({ coins: 0, modifiers: [] }),
      },
      inventory: {
        getInventory: vi.fn().mockResolvedValue({ items: [] }),
        getItemDefinitions,
      },
      gifts: {
        listIncoming: vi.fn().mockResolvedValue([incomingGift]),
        listOutgoing: vi.fn().mockResolvedValue([]),
      },
      trades: {
        listIncomingInvites: vi.fn().mockResolvedValue([]),
        listOutgoingInvites: vi.fn().mockResolvedValue([]),
        getTradeForUser: vi.fn().mockResolvedValue(null),
      },
    } as unknown as AppContext

    await getUserGameState({ context, roomId: "room1", userId: "u1" })
    expect(getItemDefinitions).toHaveBeenCalledWith(
      "room1",
      expect.arrayContaining(["item-shops:gifted-lp"]),
    )
  })

  test("includes counterpart trade offer definition ids when loading itemDefinitions", async () => {
    const trade = {
      tradeId: "t1",
      participants: {
        u1: { userId: "u1", draft: [], offer: [], locked: false, confirmed: false },
        u2: {
          userId: "u2",
          draft: [{ itemId: "i2", quantity: 1, definitionId: "item-shops:their-lp", slotPool: "inventory" }],
          offer: [],
          locked: false,
          confirmed: false,
        },
      },
    }
    const getItemDefinitions = vi.fn().mockResolvedValue([])
    const context = {
      gameSessions: {
        getActiveSession: vi.fn().mockResolvedValue({ id: "s1", config: { allowTrading: true } }),
        getUserState: vi.fn().mockResolvedValue({ coins: 0, modifiers: [] }),
      },
      inventory: {
        getInventory: vi.fn().mockResolvedValue({ items: [] }),
        getItemDefinitions,
      },
      gifts: {
        listIncoming: vi.fn().mockResolvedValue([]),
        listOutgoing: vi.fn().mockResolvedValue([]),
      },
      trades: {
        listIncomingInvites: vi.fn().mockResolvedValue([]),
        listOutgoingInvites: vi.fn().mockResolvedValue([]),
        getTradeForUser: vi.fn().mockResolvedValue(trade),
      },
    } as unknown as AppContext

    await getUserGameState({ context, roomId: "room1", userId: "u1" })
    expect(getItemDefinitions).toHaveBeenCalledWith(
      "room1",
      expect.arrayContaining(["item-shops:their-lp"]),
    )
  })

  test("skips gift and trade Redis when allowTrading is off", async () => {
    const gifts = {
      listIncoming: vi.fn(),
      listOutgoing: vi.fn(),
    }
    const trades = {
      listIncomingInvites: vi.fn(),
      listOutgoingInvites: vi.fn(),
      getTradeForUser: vi.fn(),
    }
    const context = {
      gameSessions: {
        getActiveSession: vi.fn().mockResolvedValue({ id: "s1", config: { allowTrading: false } }),
        getUserState: vi.fn().mockResolvedValue({ coins: 0, modifiers: [] }),
      },
      inventory: {
        getInventory: vi.fn().mockResolvedValue({ items: [] }),
        getItemDefinitions: vi.fn().mockResolvedValue([]),
      },
      gifts,
      trades,
    } as unknown as AppContext

    const data = await getUserGameState({ context, roomId: "room1", userId: "u1" })
    expect(gifts.listIncoming).not.toHaveBeenCalled()
    expect(gifts.listOutgoing).not.toHaveBeenCalled()
    expect(trades.listIncomingInvites).not.toHaveBeenCalled()
    expect(trades.getTradeForUser).not.toHaveBeenCalled()
    expect(data.pendingGifts).toBeUndefined()
    expect(data.pendingTradeInvites).toBeUndefined()
    expect(data.activeTrade).toBeNull()
  })
})
