import { describe, expect, it, vi, beforeEach } from "vitest"
import { ShoppingSessionHelper } from "@repo/plugin-base"
import type { InventoryItem, PluginContext, Room } from "@repo/types"
import { ItemShopsPlugin, getEligibleShops, defaultItemShopsConfig } from "./index"
import { ITEM_CATALOG } from "./items/index"
import { SHOP_CATALOG } from "./shops"
import { items } from "./items"
import { THRIFT_STORE_SHOP_ID } from "./shops/thrift-store"

const ROOM = "room-1"
const COUPON_SHORT_ID = items.thriftStoreCoupon.shortId
const COUPON_DEF_ID = `item-shops:${COUPON_SHORT_ID}`
const BB_SHORT_ID = items.bargainBinSticker.shortId
const BB_DEF_ID = `item-shops:${BB_SHORT_ID}`

function createStorage() {
  return {
    get: vi.fn(async () => null),
    set: vi.fn(),
    del: vi.fn(),
    hget: vi.fn(),
    hset: vi.fn(),
  }
}

function couponStack(overrides?: Partial<InventoryItem>): InventoryItem {
  return {
    itemId: "coupon-stack-1",
    definitionId: COUPON_DEF_ID,
    sourcePlugin: "item-shops",
    quantity: 1,
    acquiredAt: Date.now(),
    ...overrides,
  }
}

function stickerStack(overrides?: Partial<InventoryItem>): InventoryItem {
  return {
    itemId: "bb-stack-1",
    definitionId: BB_DEF_ID,
    sourcePlugin: "item-shops",
    quantity: 1,
    acquiredAt: Date.now(),
    ...overrides,
  }
}

function setup(options?: {
  enabled?: boolean
  playbackControllerId?: string
  localAccess?: "open" | "restricted"
  isAdmin?: boolean
  hasCoupon?: boolean
  hasSticker?: boolean
  couponQuantity?: number
  removeItemSucceeds?: boolean
  playlistIdBargainBin?: string
  membershipPlaylistIds?: string[]
}) {
  const enabled = options?.enabled ?? true
  const hasCoupon = options?.hasCoupon ?? true
  const hasSticker = options?.hasSticker ?? false
  const couponQuantity = options?.couponQuantity ?? 1
  const stacks: InventoryItem[] = []
  if (hasCoupon) stacks.push(couponStack({ quantity: couponQuantity }))
  if (hasSticker) stacks.push(stickerStack())

  const inventory = {
    hasItem: vi.fn(async (_userId: string, definitionId: string) => {
      return stacks.some((s) => s.definitionId === definitionId && s.quantity > 0)
    }),
    getInventory: vi.fn(async (userId: string) => ({
      userId,
      items: stacks,
      maxSlots: 20,
    })),
    removeItem: vi.fn(async () => options?.removeItemSucceeds ?? true),
    giveItem: vi.fn(async () => couponStack()),
    registerItemDefinitions: vi.fn(),
    getItemDefinition: vi.fn(),
  }

  const api = {
    getPluginConfig: vi.fn(async () => ({
      ...defaultItemShopsConfig,
      enabled,
      playlistIdBargainBin: options?.playlistIdBargainBin ?? "nd-bb",
    })),
    isRoomAdmin: vi.fn(async () => options?.isAdmin ?? false),
    sendUserSystemMessage: vi.fn(async () => {}),
    sendSystemMessage: vi.fn(async () => {}),
    getUsers: vi.fn(async () => [{ userId: "u1", username: "U1" }]),
    getUsersByIds: vi.fn(async (ids: string[]) => ids.map((id) => ({ userId: id, username: id }))),
    checkLocalTrackPlaylistMembership: vi.fn(async () => options?.membershipPlaylistIds ?? ["nd-bb"]),
  }

  const room: Pick<Room, "playbackControllerId" | "metadataSourceAccess"> = {
    playbackControllerId: options?.playbackControllerId ?? "bridge",
    metadataSourceAccess: { local: options?.localAccess ?? "restricted" },
  }

  const context = {
    roomId: ROOM,
    storage: createStorage(),
    api,
    game: {
      getActiveSession: vi.fn(async () => ({ id: "session-1" })),
    },
    inventory,
    getRoom: vi.fn(async () => room),
  } as unknown as PluginContext

  const plugin = new ItemShopsPlugin({ enabled })
  ;(plugin as unknown as { context: PluginContext }).context = context
  ;(plugin as unknown as { shopping: ShoppingSessionHelper }).shopping = new ShoppingSessionHelper(
    "item-shops",
    context,
    ITEM_CATALOG,
    SHOP_CATALOG,
  )

  return { plugin, context, api, inventory, room }
}

describe("getEligibleShops", () => {
  const config = {
    ...defaultItemShopsConfig,
    enabled: true,
    enabledShopIds: SHOP_CATALOG.map((s) => s.shopId),
  }

  it("includes Thrift Store in bridge rooms", () => {
    const shops = getEligibleShops(config, "bridge")
    expect(shops.some((s) => s.shopId === THRIFT_STORE_SHOP_ID)).toBe(true)
  })

  it("excludes Thrift Store when not on bridge", () => {
    const shops = getEligibleShops(config, "spotify")
    expect(shops.some((s) => s.shopId === THRIFT_STORE_SHOP_ID)).toBe(false)
  })

  it("excludes Thrift Store when playback controller is missing", () => {
    const shops = getEligibleShops(config, null)
    expect(shops.some((s) => s.shopId === THRIFT_STORE_SHOP_ID)).toBe(false)
  })

  it("still includes shops without a controller requirement off-bridge", () => {
    const shops = getEligibleShops(config, "spotify")
    expect(shops.some((s) => s.shopId === "green-room")).toBe(true)
  })
})

describe("ItemShopsPlugin local library grants", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("grantMetadataSourceAccess", () => {
    it("grants local search and queue when the user holds a coupon", async () => {
      const { plugin } = setup({ hasCoupon: true })
      await expect(
        plugin.grantMetadataSourceAccess({
          roomId: ROOM,
          userId: "u1",
          sourceId: "local",
          action: "search",
        }),
      ).resolves.toBe("grant")
      await expect(
        plugin.grantMetadataSourceAccess({
          roomId: ROOM,
          userId: "u1",
          sourceId: "local",
          action: "queue",
        }),
      ).resolves.toBe("grant")
    })

    it("grants when the user holds a mapped shelf sticker", async () => {
      const { plugin } = setup({
        hasCoupon: false,
        hasSticker: true,
        playlistIdBargainBin: "nd-bb",
      })
      await expect(
        plugin.grantMetadataSourceAccess({
          roomId: ROOM,
          userId: "u1",
          sourceId: "local",
          action: "search",
        }),
      ).resolves.toBe("grant")
    })

    it("abstains when sticker playlist id is unmapped", async () => {
      const { plugin } = setup({
        hasCoupon: false,
        hasSticker: true,
        playlistIdBargainBin: "",
      })
      await expect(
        plugin.grantMetadataSourceAccess({
          roomId: ROOM,
          userId: "u1",
          sourceId: "local",
          action: "search",
        }),
      ).resolves.toBe("abstain")
    })

    it("abstains without a grant, for other sources, or when disabled", async () => {
      const withCoupon = setup({ hasCoupon: true })
      await expect(
        withCoupon.plugin.grantMetadataSourceAccess({
          roomId: ROOM,
          userId: "u1",
          sourceId: "spotify",
          action: "search",
        }),
      ).resolves.toBe("abstain")

      const noCoupon = setup({ hasCoupon: false })
      await expect(
        noCoupon.plugin.grantMetadataSourceAccess({
          roomId: ROOM,
          userId: "u1",
          sourceId: "local",
          action: "queue",
        }),
      ).resolves.toBe("abstain")

      const disabled = setup({ enabled: false, hasCoupon: true })
      await expect(
        disabled.plugin.grantMetadataSourceAccess({
          roomId: ROOM,
          userId: "u1",
          sourceId: "local",
          action: "queue",
        }),
      ).resolves.toBe("abstain")
    })
  })

  describe("validateQueueRequest", () => {
    const localParams = {
      roomId: ROOM,
      userId: "u1",
      username: "U1",
      trackId: "local-1",
      mediaSourceType: "local" as const,
    }

    it("consumes one coupon for a non-admin local queue when Local is restricted", async () => {
      const { plugin, inventory, api } = setup({
        hasCoupon: true,
        localAccess: "restricted",
        isAdmin: false,
      })
      const result = await plugin.validateQueueRequest(localParams)
      expect(result).toEqual({ allowed: true })
      expect(inventory.removeItem).toHaveBeenCalledWith("u1", "coupon-stack-1", 1)
      expect(api.sendUserSystemMessage).toHaveBeenCalled()
    })

    it("prefers shelf sticker when the track is in that playlist", async () => {
      const { plugin, inventory } = setup({
        hasCoupon: true,
        hasSticker: true,
        membershipPlaylistIds: ["nd-bb"],
        playlistIdBargainBin: "nd-bb",
      })
      await plugin.validateQueueRequest(localParams)
      expect(inventory.removeItem).toHaveBeenCalledWith("u1", "bb-stack-1", 1)
    })

    it("does not consume for non-local tracks", async () => {
      const { plugin, inventory } = setup({ hasCoupon: true })
      await plugin.validateQueueRequest({
        ...localParams,
        mediaSourceType: "spotify",
      })
      expect(inventory.removeItem).not.toHaveBeenCalled()
    })

    it("does not consume for room admins", async () => {
      const { plugin, inventory } = setup({ hasCoupon: true, isAdmin: true })
      await plugin.validateQueueRequest(localParams)
      expect(inventory.removeItem).not.toHaveBeenCalled()
    })

    it("does not consume when Local is open", async () => {
      const { plugin, inventory } = setup({
        hasCoupon: true,
        localAccess: "open",
      })
      await plugin.validateQueueRequest(localParams)
      expect(inventory.removeItem).not.toHaveBeenCalled()
    })

    it("does not consume when the user has no grant", async () => {
      const { plugin, inventory } = setup({ hasCoupon: false })
      await plugin.validateQueueRequest(localParams)
      expect(inventory.removeItem).not.toHaveBeenCalled()
    })
  })

  describe("giveItemToUsers", () => {
    it("refuses library grants off-bridge", async () => {
      const { plugin } = setup({ playbackControllerId: "spotify" })
      const result = await plugin.executeAction("giveItemToUsers", undefined, {
        itemShortId: COUPON_SHORT_ID,
        userId: "u1",
      })
      expect(result.success).toBe(false)
      expect(result.message).toMatch(/media bridge/i)

      const sticker = await plugin.executeAction("giveItemToUsers", undefined, {
        itemShortId: BB_SHORT_ID,
        userId: "u1",
      })
      expect(sticker.success).toBe(false)
    })

    it("grants the coupon in a bridge room", async () => {
      const { plugin, inventory } = setup({ playbackControllerId: "bridge" })
      const result = await plugin.executeAction("giveItemToUsers", undefined, {
        itemShortId: COUPON_SHORT_ID,
        userId: "u1",
      })
      expect(result.success).toBe(true)
      expect(inventory.giveItem).toHaveBeenCalled()
    })
  })
})
