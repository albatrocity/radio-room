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
        allowTrading: false,
        allowSelling: true,
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
    expect((payload as any).currentShopInstance).toBeUndefined()
    expect((payload as any).bingoCard).toBeUndefined()
  })

  it("returns null plugin bags for users without shop/bingo data", () => {
    const payload = buildUserGameStatePayload(minimalSnap(), "nobody")
    expect(payload.pluginUserState?.["item-shops"]?.currentShopInstance).toBeNull()
    expect(payload.pluginUserState?.["playlist-bingo"]?.card).toBeNull()
  })
})
