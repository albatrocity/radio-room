import { describe, expect, it, vi, beforeEach } from "vitest"
import { ShoppingSessionHelper } from "@repo/plugin-base"
import type { InventoryItem, PluginContext, Room } from "@repo/types"
import type { ItemCatalogEntry } from "@repo/plugin-base/helpers"
import { ItemShopsPlugin, getEligibleShops, defaultItemShopsConfig } from "./index"
import { SHOP_CATALOG } from "./shops"
import { DEFAULT_LOCAL_LIBRARY_GRANTS } from "./types"
import { RECORD_STORE_SHOP_ID, PUBLIC_LIBRARY_SHOP_ID } from "./localLibrary/catalog"
import { queueItemFactory } from "@repo/factories"

const ROOM = "room-1"
const LIBRARY_CARD_SHORT_ID = "library-card"
const LIBRARY_CARD_DEF_ID = `item-shops:${LIBRARY_CARD_SHORT_ID}`
const BURNED_CD_SHORT_ID = "burned-cd-bargain-bin"
const BURNED_CD_DEF_ID = `item-shops:${BURNED_CD_SHORT_ID}`
const PM_SHORT_ID = "pm-loveless"
const PM_DEF_ID = `item-shops:${PM_SHORT_ID}`

function createStorage() {
  return {
    get: vi.fn(async () => null),
    set: vi.fn(),
    del: vi.fn(),
    hget: vi.fn(),
    hset: vi.fn(),
  }
}

function libraryCardStack(overrides?: Partial<InventoryItem>): InventoryItem {
  return {
    itemId: "library-card-stack-1",
    definitionId: LIBRARY_CARD_DEF_ID,
    sourcePlugin: "item-shops",
    quantity: 1,
    acquiredAt: Date.now(),
    ...overrides,
  }
}

function burnedCdStack(overrides?: Partial<InventoryItem>): InventoryItem {
  return {
    itemId: "bb-stack-1",
    definitionId: BURNED_CD_DEF_ID,
    sourcePlugin: "item-shops",
    quantity: 1,
    acquiredAt: Date.now(),
    ...overrides,
  }
}

function physicalMediaStack(overrides?: Partial<InventoryItem>): InventoryItem {
  return {
    itemId: "pm-stack-1",
    definitionId: PM_DEF_ID,
    sourcePlugin: "item-shops",
    quantity: 1,
    acquiredAt: Date.now(),
    ...overrides,
  }
}

const BURNED_CD_GRANT = {
  shortId: BURNED_CD_SHORT_ID,
  name: "Burned CD: Bargain Bin",
  description: "",
  icon: "Disc",
  stackable: true,
  maxStack: 5,
  tradeable: true,
  consumable: false,
  coinValue: 15,
  rarity: "common" as const,
  scope: "playlist" as const,
  playlistId: "",
  redemption: "perQueue" as const,
}

const DERIVED_PM: ItemCatalogEntry = {
  definition: {
    shortId: PM_SHORT_ID,
    name: "LP: Loveless",
    description: "",
    icon: "Disc3",
    artworkFrame: "record-jacket",
    stackable: true,
    maxStack: 5,
    tradeable: true,
    consumable: false,
    coinValue: 20,
    rarity: "uncommon",
    slotPool: "collection",
  },
  localLibraryGrant: {
    scope: "playlist",
    playlistKey: PM_SHORT_ID,
    redemption: "durable",
  },
}

function setup(options?: {
  enabled?: boolean
  playbackControllerId?: string
  localAccess?: "open" | "restricted"
  isAdmin?: boolean
  hasLibraryCard?: boolean
  hasBurnedCd?: boolean
  hasPhysicalMedia?: boolean
  physicalMediaImageUrl?: string
  physicalMediaImageUrlLarge?: string
  libraryCardQuantity?: number
  removeItemSucceeds?: boolean
  playlistIdBargainBin?: string
  membershipPlaylistIds?: string[]
}) {
  const enabled = options?.enabled ?? true
  const hasLibraryCard = options?.hasLibraryCard ?? true
  const hasBurnedCd = options?.hasBurnedCd ?? false
  const hasPhysicalMedia = options?.hasPhysicalMedia ?? false
  const libraryCardQuantity = options?.libraryCardQuantity ?? 1
  const stacks: InventoryItem[] = []
  if (hasLibraryCard) stacks.push(libraryCardStack({ quantity: libraryCardQuantity }))
  if (hasBurnedCd) stacks.push(burnedCdStack())
  if (hasPhysicalMedia) stacks.push(physicalMediaStack())

  const grants = hasBurnedCd || options?.playlistIdBargainBin != null
    ? [
        {
          ...BURNED_CD_GRANT,
          playlistId: options?.playlistIdBargainBin ?? "nd-bb",
        },
      ]
    : [...DEFAULT_LOCAL_LIBRARY_GRANTS]

  const inventory = {
    hasItem: vi.fn(async (_userId: string, definitionId: string) => {
      return stacks.some((s) => s.definitionId === definitionId && s.quantity > 0)
    }),
    getInventory: vi.fn(async (userId: string) => ({
      userId,
      items: stacks,
      maxSlots: 20,
      maxCollectionSlots: 20,
    })),
    removeItem: vi.fn(async () => options?.removeItemSucceeds ?? true),
    giveItem: vi.fn(async () => libraryCardStack()),
    registerItemDefinitions: vi.fn(),
    getItemDefinition: vi.fn(),
  }

  const api = {
    getPluginConfig: vi.fn(async () => ({
      ...defaultItemShopsConfig,
      enabled,
      localLibraryGrants: grants,
    })),
    isRoomAdmin: vi.fn(async () => options?.isAdmin ?? false),
    sendUserSystemMessage: vi.fn(async () => {}),
    sendSystemMessage: vi.fn(async () => {}),
    getUsers: vi.fn(async () => [{ userId: "u1", username: "U1" }]),
    getUsersByIds: vi.fn(async (ids: string[]) => ids.map((id) => ({ userId: id, username: id }))),
    checkLocalTrackPlaylistMembership: vi.fn(
      async () => options?.membershipPlaylistIds ?? ["nd-bb"],
    ),
    listLocalPlaylists: vi.fn(async () => []),
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

  const plugin = new ItemShopsPlugin({ enabled, localLibraryGrants: grants })
  ;(plugin as unknown as { context: PluginContext }).context = context
  const localLibrary = (
    plugin as unknown as {
      localLibrary: {
        derivedPhysicalMedia: ItemCatalogEntry[]
        derivedPlaylistMap: Record<string, string>
        applyConfig: (g: typeof grants) => {
          itemCatalog: ItemCatalogEntry[]
          shopCatalog: unknown
        }
      }
    }
  ).localLibrary
  if (hasPhysicalMedia) {
    localLibrary.derivedPhysicalMedia = [
      options?.physicalMediaImageUrl || options?.physicalMediaImageUrlLarge
        ? {
            ...DERIVED_PM,
            definition: {
              ...DERIVED_PM.definition,
              ...(options?.physicalMediaImageUrl
                ? { imageUrl: options.physicalMediaImageUrl }
                : {}),
              ...(options?.physicalMediaImageUrlLarge
                ? { imageUrlLarge: options.physicalMediaImageUrlLarge }
                : {}),
            },
          }
        : DERIVED_PM,
    ]
    localLibrary.derivedPlaylistMap = { [PM_SHORT_ID]: "nd-lp" }
  }
  const { itemCatalog, shopCatalog } = localLibrary.applyConfig(grants)
  ;(plugin as unknown as { shopping: ShoppingSessionHelper }).shopping = new ShoppingSessionHelper(
    "item-shops",
    context,
    itemCatalog,
    shopCatalog as never,
  )

  return { plugin, context, api, inventory, room }
}

describe("getEligibleShops", () => {
  const config = {
    ...defaultItemShopsConfig,
    enabled: true,
    enabledShopIds: defaultItemShopsConfig.enabledShopIds,
  }

  it("includes Record Store in bridge rooms when records derive", () => {
    const shops = getEligibleShops(config, "bridge", [DERIVED_PM])
    expect(shops.some((s) => s.shopId === RECORD_STORE_SHOP_ID)).toBe(true)
    const recordStore = shops.find((s) => s.shopId === RECORD_STORE_SHOP_ID)!
    expect(recordStore.availableItems.some((i) => i.shortId === PM_SHORT_ID)).toBe(true)
    expect(recordStore.availableItems.some((i) => i.shortId === "scratched-cd")).toBe(true)
  })

  it("omits Record Store when no records derive", () => {
    const shops = getEligibleShops(config, "bridge", [])
    expect(shops.some((s) => s.shopId === RECORD_STORE_SHOP_ID)).toBe(false)
  })

  it("includes Public Library in bridge rooms", () => {
    const shops = getEligibleShops(config, "bridge", [])
    expect(shops.some((s) => s.shopId === PUBLIC_LIBRARY_SHOP_ID)).toBe(true)
    const library = shops.find((s) => s.shopId === PUBLIC_LIBRARY_SHOP_ID)!
    expect(library.availableItems.some((i) => i.shortId === LIBRARY_CARD_SHORT_ID)).toBe(true)
  })

  it("excludes Record Store and Public Library when not on bridge", () => {
    const shops = getEligibleShops(config, "spotify", [DERIVED_PM])
    expect(shops.some((s) => s.shopId === RECORD_STORE_SHOP_ID)).toBe(false)
    expect(shops.some((s) => s.shopId === PUBLIC_LIBRARY_SHOP_ID)).toBe(false)
  })

  it("still includes shops without a controller requirement off-bridge", () => {
    const shops = getEligibleShops(
      { ...config, enabledShopIds: SHOP_CATALOG.map((s) => s.shopId) },
      "spotify",
    )
    expect(shops.some((s) => s.shopId === "green-room")).toBe(true)
  })
})

describe("ItemShopsPlugin local library grants", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("grantMetadataSourceAccess", () => {
    it("grants local search and queue when the user holds a Library Card", async () => {
      const { plugin } = setup({ hasLibraryCard: true })
      await expect(
        plugin.grantMetadataSourceAccess({
          roomId: ROOM,
          userId: "u1",
          sourceId: "local",
          action: "search",
        }),
      ).resolves.toBe("grant")
    })

    it("grants when the user holds a mapped burned CD", async () => {
      const { plugin } = setup({
        hasLibraryCard: false,
        hasBurnedCd: true,
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

    it("grants when the user holds Physical Media", async () => {
      const { plugin } = setup({
        hasLibraryCard: false,
        hasPhysicalMedia: true,
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

    it("abstains when burned CD playlist id is unmapped", async () => {
      const { plugin } = setup({
        hasLibraryCard: false,
        hasBurnedCd: true,
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
      const withCard = setup({ hasLibraryCard: true })
      await expect(
        withCard.plugin.grantMetadataSourceAccess({
          roomId: ROOM,
          userId: "u1",
          sourceId: "spotify",
          action: "search",
        }),
      ).resolves.toBe("abstain")

      const noCard = setup({ hasLibraryCard: false })
      await expect(
        noCard.plugin.grantMetadataSourceAccess({
          roomId: ROOM,
          userId: "u1",
          sourceId: "local",
          action: "queue",
        }),
      ).resolves.toBe("abstain")

      const disabled = setup({ enabled: false, hasLibraryCard: true })
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

  describe("listPhysicalMediaItems", () => {
    it("returns held playlist grants as mediaKey items, never playlist ids", async () => {
      const { plugin } = setup({
        hasLibraryCard: true,
        hasPhysicalMedia: true,
      })
      const items = await plugin.listPhysicalMediaItems({ roomId: ROOM, userId: "u1" })
      expect(items).toEqual([
        expect.objectContaining({ mediaKey: PM_SHORT_ID, name: "LP: Loveless" }),
      ])
      expect(items.some((s) => s.mediaKey.includes("nd-"))).toBe(false)
    })

    it("carries the record's cover artwork when the definition has one", async () => {
      const { plugin } = setup({
        hasLibraryCard: false,
        hasPhysicalMedia: true,
        physicalMediaImageUrl: "/api/rooms/room-1/images/pl-cover-nd-lp-abcd1234",
        physicalMediaImageUrlLarge: "/api/rooms/room-1/images/pl-cover-nd-lp-abcd1234-lg",
      })
      const items = await plugin.listPhysicalMediaItems({ roomId: ROOM, userId: "u1" })
      expect(items[0]?.imageUrl).toBe("/api/rooms/room-1/images/pl-cover-nd-lp-abcd1234")
      expect(items[0]?.imageUrlLarge).toBe(
        "/api/rooms/room-1/images/pl-cover-nd-lp-abcd1234-lg",
      )
      expect(items[0]?.artworkFrame).toBe("record-jacket")
    })
  })

  describe("augmentNowPlaying", () => {
    const localTrack = queueItemFactory.build({
      mediaSource: { type: "local", trackId: "local-track-1" },
    })

    it("attaches the sleeve when the Local track is on a derived record with cover art", async () => {
      const { plugin, api } = setup({
        hasPhysicalMedia: true,
        physicalMediaImageUrl: "/api/rooms/room-1/images/pl-cover-nd-lp-abcd1234",
        physicalMediaImageUrlLarge: "/api/rooms/room-1/images/pl-cover-nd-lp-abcd1234-lg",
        membershipPlaylistIds: ["nd-lp"],
      })
      await expect(plugin.augmentNowPlaying(localTrack)).resolves.toEqual({
        physicalMediaFrame: {
          imageUrl: "/api/rooms/room-1/images/pl-cover-nd-lp-abcd1234",
          imageUrlLarge: "/api/rooms/room-1/images/pl-cover-nd-lp-abcd1234-lg",
          artworkFrame: "record-jacket",
        },
      })
      expect(api.checkLocalTrackPlaylistMembership).toHaveBeenCalledWith({
        roomId: ROOM,
        trackId: "local-track-1",
        playlistIds: ["nd-lp"],
      })
    })

    it("skips when the track is not on a derived record", async () => {
      const { plugin } = setup({
        hasPhysicalMedia: true,
        physicalMediaImageUrl: "/cover.jpg",
        membershipPlaylistIds: [],
      })
      await expect(plugin.augmentNowPlaying(localTrack)).resolves.toEqual({})
    })

    it("attaches the frame without imageUrl when the record has no cover art", async () => {
      const { plugin, api } = setup({
        hasPhysicalMedia: true,
        membershipPlaylistIds: ["nd-lp"],
      })
      await expect(plugin.augmentNowPlaying(localTrack)).resolves.toEqual({
        physicalMediaFrame: { artworkFrame: "record-jacket" },
      })
      expect(api.checkLocalTrackPlaylistMembership).toHaveBeenCalledWith({
        roomId: ROOM,
        trackId: "local-track-1",
        playlistIds: ["nd-lp"],
      })
    })

    it("skips non-Local tracks", async () => {
      const { plugin, api } = setup({
        hasPhysicalMedia: true,
        physicalMediaImageUrl: "/cover.jpg",
      })
      await expect(plugin.augmentNowPlaying(queueItemFactory.build())).resolves.toEqual({})
      expect(api.checkLocalTrackPlaylistMembership).not.toHaveBeenCalled()
    })

    it("skips when Item Shops is disabled", async () => {
      const { plugin, api } = setup({
        enabled: false,
        hasPhysicalMedia: true,
        physicalMediaImageUrl: "/cover.jpg",
        membershipPlaylistIds: ["nd-lp"],
      })
      await expect(plugin.augmentNowPlaying(localTrack)).resolves.toEqual({})
      expect(api.checkLocalTrackPlaylistMembership).not.toHaveBeenCalled()
    })

    it("augmentQueueBatch attaches frames per Local item and skips others", async () => {
      const { plugin, api } = setup({
        hasPhysicalMedia: true,
        physicalMediaImageUrl: "/cover.jpg",
        membershipPlaylistIds: ["nd-lp"],
      })
      const other = queueItemFactory.build()
      await expect(plugin.augmentQueueBatch([localTrack, other, localTrack])).resolves.toEqual([
        { physicalMediaFrame: { imageUrl: "/cover.jpg", artworkFrame: "record-jacket" } },
        {},
        { physicalMediaFrame: { imageUrl: "/cover.jpg", artworkFrame: "record-jacket" } },
      ])
      expect(api.checkLocalTrackPlaylistMembership).toHaveBeenCalledTimes(1)
    })
  })

  describe("resolvePhysicalMediaItem", () => {
    it("resolves a held mediaKey to the mapped playlist id", async () => {
      const { plugin } = setup({ hasLibraryCard: false, hasPhysicalMedia: true })
      await expect(
        plugin.resolvePhysicalMediaItem({ roomId: ROOM, userId: "u1", mediaKey: PM_SHORT_ID }),
      ).resolves.toEqual({
        playlistId: "nd-lp",
        item: expect.objectContaining({ mediaKey: PM_SHORT_ID, name: "LP: Loveless" }),
      })
    })

    it("returns null when the caller does not hold the item", async () => {
      const { plugin } = setup({ hasLibraryCard: true, hasPhysicalMedia: false })
      await expect(
        plugin.resolvePhysicalMediaItem({ roomId: ROOM, userId: "u1", mediaKey: PM_SHORT_ID }),
      ).resolves.toBeNull()
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

    it("consumes one Library Card for a non-admin local queue when Local is restricted", async () => {
      const { plugin, inventory, api } = setup({
        hasLibraryCard: true,
        localAccess: "restricted",
        isAdmin: false,
      })
      const result = await plugin.validateQueueRequest(localParams)
      expect(result).toEqual({ allowed: true })
      expect(inventory.removeItem).toHaveBeenCalledWith("u1", "library-card-stack-1", 1)
      expect(api.sendUserSystemMessage).toHaveBeenCalled()
    })

    it("prefers burned CD when the track is in that playlist", async () => {
      const { plugin, inventory } = setup({
        hasLibraryCard: true,
        hasBurnedCd: true,
        membershipPlaylistIds: ["nd-bb"],
        playlistIdBargainBin: "nd-bb",
      })
      await plugin.validateQueueRequest(localParams)
      expect(inventory.removeItem).toHaveBeenCalledWith("u1", "bb-stack-1", 1)
    })

    it("does not consume durable Physical Media", async () => {
      const { plugin, inventory } = setup({
        hasLibraryCard: false,
        hasPhysicalMedia: true,
        membershipPlaylistIds: ["nd-lp"],
      })
      const result = await plugin.validateQueueRequest(localParams)
      expect(result).toEqual({ allowed: true })
      expect(inventory.removeItem).not.toHaveBeenCalled()
    })

    it("does not consume for non-local tracks", async () => {
      const { plugin, inventory } = setup({ hasLibraryCard: true })
      await plugin.validateQueueRequest({
        ...localParams,
        mediaSourceType: "spotify",
      })
      expect(inventory.removeItem).not.toHaveBeenCalled()
    })

    it("does not consume for room admins", async () => {
      const { plugin, inventory } = setup({ hasLibraryCard: true, isAdmin: true })
      await plugin.validateQueueRequest(localParams)
      expect(inventory.removeItem).not.toHaveBeenCalled()
    })

    it("does not consume when Local is open", async () => {
      const { plugin, inventory } = setup({
        hasLibraryCard: true,
        localAccess: "open",
      })
      await plugin.validateQueueRequest(localParams)
      expect(inventory.removeItem).not.toHaveBeenCalled()
    })

    it("does not consume when the user has no grant", async () => {
      const { plugin, inventory } = setup({ hasLibraryCard: false })
      await plugin.validateQueueRequest(localParams)
      expect(inventory.removeItem).not.toHaveBeenCalled()
    })
  })

  describe("giveItemToUsers", () => {
    it("refuses library grants off-bridge", async () => {
      const { plugin } = setup({ playbackControllerId: "spotify" })
      const result = await plugin.executeAction("giveItemToUsers", undefined, {
        itemShortId: LIBRARY_CARD_SHORT_ID,
        userId: "u1",
      })
      expect(result.success).toBe(false)
      expect(result.message).toMatch(/media bridge/i)
    })

    it("grants a Library Card in a bridge room", async () => {
      const { plugin, inventory } = setup({ playbackControllerId: "bridge" })
      const result = await plugin.executeAction("giveItemToUsers", undefined, {
        itemShortId: LIBRARY_CARD_SHORT_ID,
        userId: "u1",
      })
      expect(result.success).toBe(true)
      expect(inventory.giveItem).toHaveBeenCalled()
    })
  })
})
