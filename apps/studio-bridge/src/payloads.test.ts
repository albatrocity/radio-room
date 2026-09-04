import { describe, expect, it } from "vitest"
import { buildUserGameStatePayload } from "./payloads.js"
import type { BridgeSnapshot } from "./types.js"

function minimalSnap(overrides: Partial<BridgeSnapshot> = {}): BridgeSnapshot {
  return {
    roomId: "room-1",
    users: [],
    chat: [],
    queue: [],
    activeSession: {
      id: "s1",
      roomId: "room-1",
      status: "active",
      startedAt: 1,
      config: {
        id: "c1",
        name: "Test",
        enabledAttributes: ["score", "coin"],
        initialValues: {},
        leaderboards: [],
        mode: "freeplay",
        inventoryEnabled: true,
        maxInventorySlots: 10,
        maxCollectionSlots: 12,
        maxPlaybackSlots: 2,
        allowTrading: false,
        allowSelling: true,
        physicalMediaWearForAdmins: true,
      },
    } as any,
    userStates: {},
    inventories: {},
    itemDefinitions: [],
    pluginConfigs: {},
    shoppingByUser: {},
    storedArtifacts: [],
    ...overrides,
  }
}

describe("buildUserGameStatePayload", () => {
  it("puts shop and bingo into pluginUserState", () => {
    const snap = minimalSnap({
      shoppingByUser: {
        u1: {
          shopId: "s",
          shopName: "Shop",
          offers: [],
          openedAt: 1,
        },
      },
      bingoByUser: {
        u1: {
          userId: "u1",
          status: "playing",
          cells: [],
        },
      },
    })

    const payload = buildUserGameStatePayload(snap, "u1")
    expect(payload.pluginUserState?.["item-shops"]?.currentShopInstance).toMatchObject({
      shopName: "Shop",
    })
    expect(payload.pluginUserState?.["playlist-bingo"]?.card).toMatchObject({
      userId: "u1",
      status: "playing",
    })
    expect(payload.pluginUserState?.["queue-theme"]).toMatchObject({
      theme: expect.any(String),
      isDecoy: false,
    })
    expect((payload as any).currentShopInstance).toBeUndefined()
    expect((payload as any).bingoCard).toBeUndefined()
  })

  it("returns null plugin bags for users without shop/bingo data", () => {
    const payload = buildUserGameStatePayload(minimalSnap(), "nobody")
    expect(payload.pluginUserState?.["item-shops"]?.currentShopInstance).toBeNull()
    expect(payload.pluginUserState?.["playlist-bingo"]?.card).toBeNull()
    expect(payload.pluginUserState?.["queue-theme"]?.theme).toEqual(expect.any(String))
  })

  it("includes pendingGifts and activeTrade for the viewer", () => {
    const offer = {
      offerId: "g1",
      roomId: "room-1",
      fromUserId: "u2",
      toUserId: "u1",
      definitionId: "item-shops:x",
      sourcePlugin: "item-shops",
      originalItemId: "i1",
      quantity: 1,
      createdAt: 1,
    }
    const trade = {
      tradeId: "t1",
      roomId: "room-1",
      status: "open" as const,
      fromUserId: "u1",
      toUserId: "u2",
      participants: {
        u1: { userId: "u1", draft: [], offer: [], locked: false, confirmed: false },
        u2: { userId: "u2", draft: [], offer: [], locked: false, confirmed: false },
      },
      createdAt: 1,
      updatedAt: 1,
    }
    const snap = minimalSnap({
      pendingGifts: [offer],
      trades: { t1: trade },
    })
    const payload = buildUserGameStatePayload(snap, "u1")
    expect(payload.pendingGifts).toEqual({
      incoming: [offer],
      outgoing: [],
    })
    expect(payload.activeTrade).toEqual(trade)
  })

  it("attaches 50% sellbackValue on playback devices", () => {
    const def = {
      id: "item-shops:cd-player",
      shortId: "cd-player",
      sourcePlugin: "item-shops",
      name: "CD Player",
      description: "",
      stackable: false,
      maxStack: 1,
      tradeable: true,
      consumable: false,
      slotPool: "playback" as const,
      coinValue: 80,
      icon: "Disc2",
    }
    const item = {
      itemId: "dev-1",
      definitionId: def.id,
      sourcePlugin: "item-shops",
      quantity: 1,
      acquiredAt: 1,
    }
    const payload = buildUserGameStatePayload(
      minimalSnap({
        itemDefinitions: [def],
        inventories: { u1: [item] },
      }),
      "u1",
    )
    expect(payload.inventory?.items).toEqual([{ ...item, sellbackValue: 40 }])
  })

  it("includes pendingTradeInvites for the viewer", () => {
    const invite = {
      inviteId: "inv1",
      roomId: "room-1",
      fromUserId: "u2",
      toUserId: "u1",
      createdAt: 1,
    }
    const snap = minimalSnap({ pendingTradeInvites: [invite] })
    const payload = buildUserGameStatePayload(snap, "u1")
    expect(payload.pendingTradeInvites).toEqual({
      incoming: [invite],
      outgoing: [],
    })
  })
})
