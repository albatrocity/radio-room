import { describe, expect, it, vi } from "vitest"
import type { InventoryItem, PhysicalMediaPick, PluginContext, QueueItem, Room } from "@repo/types"
import type { ItemShopsShopCatalogEntry } from "@repo/plugin-base/helpers"
import { queueItemFactory } from "@repo/factories"
import { LocalLibraryModule, sourceAlbumOf } from "./index"
import { ItemShopsPlugin, defaultItemShopsConfig } from "../index"
import { withPhysicalMediaStock } from "./catalog"
import { PLAYBACK_DEVICE_MISSING_REASON } from "./playbackDevices"

const ROOM = "room-1"
const ALBUM = "4BRkPBUxOYffM2QXVlq7aC"
const HARVEST: PhysicalMediaPick = {
  source: "spotify",
  id: ALBUM,
  title: "Harvest",
  artist: "Neil Young",
  year: 1972,
  trackCount: 10,
}
const NO_OTHER: PhysicalMediaPick = {
  source: "local",
  id: "studio-id",
  title: "No Other",
  artist: "Gene Clark",
  year: 1974,
  trackCount: 8,
}
const HARVEST_ID = `pm-spotify-lp-${ALBUM}`

function stack(definitionId: string, itemId = definitionId): InventoryItem {
  return { itemId, definitionId, sourcePlugin: "item-shops", quantity: 1, acquiredAt: 0 }
}

function setup(
  options: {
    items?: InventoryItem[]
    spotify?: "open" | "restricted"
    sources?: string[]
    storage?: Map<string, unknown>
    isAdmin?: boolean
  } = {},
) {
  const json = options.storage ?? new Map<string, unknown>()
  const items = options.items ?? []
  const room: Partial<Room> = {
    playbackControllerId: "bridge",
    metadataSourceAccess: { spotify: options.spotify ?? "restricted" },
  }
  const catalog = {
    listMetadataSources: vi.fn(async () =>
      (options.sources ?? ["spotify", "local"]).map((id) => ({ id, label: id })),
    ),
    listLibraryAlbums: vi.fn(async () => [
      { id: "room-nd-7", name: "No Other", artist: "Gene Clark", year: 1974 },
    ]),
    getAlbumTrackIds: vi.fn(async ({ albumId }: { albumId: string }) =>
      albumId === ALBUM ? ["harvest-1", "harvest-2"] : [],
    ),
  }
  const inventory = {
    getInventory: vi.fn(async (userId: string) => ({ userId, items, maxSlots: 20 })),
    updateItemMetadata: vi.fn(async () => null),
    removeItem: vi.fn(async () => true),
    giveItem: vi.fn(async () => null),
  }
  const api = {
    isRoomAdmin: vi.fn(async () => options.isAdmin ?? false),
    sendUserToast: vi.fn(async () => {}),
  }
  const context = {
    roomId: ROOM,
    catalog,
    inventory,
    api,
    game: { getActiveSession: vi.fn(async () => ({ config: {} })) },
    getRoom: vi.fn(async () => room),
    storage: {
      getJson: vi.fn(async (key: string) => ({ value: json.get(key) ?? null })),
      setJson: vi.fn(
        async (key: string, value: unknown) => void json.set(key, structuredClone(value)),
      ),
      del: vi.fn(async (key: string) => void json.delete(key)),
    },
  } as unknown as PluginContext
  const module = new LocalLibraryModule("item-shops", () => context)
  return { module, catalog, inventory, json, context }
}

const queue = (trackId: string) => ({
  roomId: ROOM,
  userId: "u1",
  username: "U1",
  trackId,
  mediaSourceType: "spotify",
})

const enabled = { enabled: true }

describe("picked records", () => {
  it("resolves picks, stocks them, and reports what won't stock", async () => {
    const { module } = setup({ sources: ["spotify", "local"] })
    const stray = { ...NO_OTHER, id: "x", title: "White Light" }
    await module.registerPicks([
      HARVEST,
      NO_OTHER,
      stray,
      { ...HARVEST, source: "local" as const, id: "y", title: "Zuma" },
    ])
    expect(module.pickedRecords.map((e) => e.definition.shortId).sort()).toEqual(
      ["pm-local-lp-room-nd-7", HARVEST_ID].sort(),
    )
    expect(module.pickStock([HARVEST, NO_OTHER]).map((s) => s.shortId)).toEqual([
      HARVEST_ID,
      "pm-local-lp-room-nd-7",
    ])
    expect(module.pickAvailability([HARVEST, NO_OTHER, stray])).toEqual({
      total: 3,
      available: 2,
      unresolved: ["Gene Clark – White Light"],
      unavailableSources: {},
    })
  })

  it("doesn't stock picks from a source the room doesn't offer", async () => {
    const { module } = setup({ sources: ["local"] })
    await module.registerPicks([HARVEST])
    expect(module.pickStock([HARVEST])).toEqual([])
    expect(module.pickAvailability([HARVEST]).unavailableSources).toEqual({ spotify: 1 })
  })

  it("pools picks with a genre-filtered library bin", async () => {
    const { module } = setup()
    await module.registerPicks([HARVEST])
    const shop: ItemShopsShopCatalogEntry = {
      shopId: "dusty-boots",
      name: "Dusty Boots",
      availableItems: [],
      listedBuybackRate: 0,
      unlistedBuybackRate: 0,
      physicalMedia: { library: { genres: ["Country"] }, picks: [HARVEST] },
    }
    const country = {
      definition: {
        shortId: "pm-al-country",
        name: "CD: Country",
        description: "",
        mediaFormat: "CD" as const,
        genres: ["Country"],
        coinValue: 10,
      },
    }
    const stocked = withPhysicalMediaStock(shop, [country as never], module.pickStock)
    expect(stocked.availableItems.map((i) => i.shortId)).toEqual(["pm-al-country", HARVEST_ID])
    expect(stocked.distinctOffers).toBe(true)
  })

  it("keeps sold picks resolvable after a restart", async () => {
    const storage = new Map<string, unknown>()
    await setup({ storage }).module.registerPicks([HARVEST])
    const { module } = setup({ storage, items: [stack(`item-shops:${HARVEST_ID}`)] })
    await module.loadPickedRecords()
    await expect(module.resolveHeldPhysicalMediaItem("u1", HARVEST_ID, [])).resolves.toMatchObject({
      kind: "album",
      albumId: ALBUM,
      sourceId: "spotify",
    })
    await expect(module.listPhysicalMediaItems("u1")).resolves.toEqual([
      expect.objectContaining({ mediaKey: HARVEST_ID, name: "LP: Harvest" }),
    ])
  })

  it("routes a local pick through the album-scope library grant", async () => {
    const { module } = setup()
    await module.registerPicks([NO_OTHER])
    expect(module.albumMap()).toEqual({ "pm-local-lp-room-nd-7": "room-nd-7" })
    module.applyConfig([])
    expect(module.isGrantShortId("pm-local-lp-room-nd-7")).toBe(true)
  })
})

describe("picked Spotify records on a restricted source", () => {
  async function holding(items: InventoryItem[], options: Parameters<typeof setup>[0] = {}) {
    const created = setup({ ...options, items })
    await created.module.registerPicks([HARVEST])
    return created
  }

  it("grants queueing a track on the held album, and nothing else", async () => {
    const { module } = await holding([stack(`item-shops:${HARVEST_ID}`)])
    const grant = (trackId?: string, action: "queue" | "search" = "queue") =>
      module.grantMetadataSourceAccess(
        {
          roomId: ROOM,
          userId: "u1",
          sourceId: "spotify",
          action,
          ...(trackId ? { trackId } : {}),
        },
        enabled,
      )
    await expect(grant("harvest-1")).resolves.toBe("grant")
    await expect(grant("zuma-1")).resolves.toBe("abstain")
    await expect(grant()).resolves.toBe("abstain")
    await expect(grant("harvest-1", "search")).resolves.toBe("abstain")
  })

  it("abstains without the record", async () => {
    const { module } = await holding([])
    await expect(
      module.grantMetadataSourceAccess(
        { roomId: ROOM, userId: "u1", sourceId: "spotify", action: "queue", trackId: "harvest-1" },
        enabled,
      ),
    ).resolves.toBe("abstain")
  })

  it("needs a player and wears the copy on queue", async () => {
    const record = stack(`item-shops:${HARVEST_ID}`, "harvest-copy")
    const withPlayer = await holding([record, stack("item-shops:turntable")])
    await expect(
      withPlayer.module.validateQueueRequest(queue("harvest-1"), enabled),
    ).resolves.toEqual({
      allowed: true,
      pluginData: { physicalMediaFrame: { condition: "mint" } },
    })
    expect(withPlayer.inventory.updateItemMetadata).toHaveBeenCalledWith("u1", "harvest-copy", {
      condition: "good",
    })

    const noPlayer = await holding([record])
    await expect(
      noPlayer.module.validateQueueRequest(queue("harvest-1"), enabled),
    ).resolves.toEqual({
      allowed: false,
      reason: PLAYBACK_DEVICE_MISSING_REASON,
    })
  })

  it("leaves tracks no record covers, and open sources, to other grants", async () => {
    const record = stack(`item-shops:${HARVEST_ID}`)
    const restricted = await holding([record])
    await expect(restricted.module.validateQueueRequest(queue("zuma-1"), enabled)).resolves.toEqual(
      {
        allowed: true,
      },
    )
    const open = await holding([record], { spotify: "open" })
    await expect(open.module.validateQueueRequest(queue("harvest-1"), enabled)).resolves.toEqual({
      allowed: true,
    })
    expect(open.inventory.updateItemMetadata).not.toHaveBeenCalled()
  })
})

describe("Now Playing sleeves for picked non-local records", () => {
  const COVER = "https://i.scdn.co/image/harvest"
  const spotifyTrack = (albumId: string, condition?: string) => {
    const { track } = queueItemFactory.build()
    return queueItemFactory.build({
      mediaSource: { type: "spotify", trackId: "harvest-1" },
      metadataSource: { type: "spotify", trackId: "harvest-1" },
      track: { ...track, album: { ...track.album, id: albumId } },
      ...(condition ? { pluginData: { "item-shops": { physicalMediaFrame: { condition } } } } : {}),
    })
  }

  it("reads the queued track's source album", () => {
    expect(sourceAlbumOf(spotifyTrack(ALBUM))).toEqual({ sourceId: "spotify", albumId: ALBUM })
    expect(
      sourceAlbumOf(queueItemFactory.build({ mediaSource: { type: "local", trackId: "nd-1" } })),
    ).toBeUndefined()
  })

  it("prefers the source's own enrichment over another source's primary track", () => {
    const base = spotifyTrack("other-album")
    const item = {
      ...base,
      metadataSource: { type: "tidal" as const, trackId: "t-1" },
      metadataSources: {
        spotify: {
          source: { type: "spotify" as const, trackId: "harvest-1" },
          track: { ...base.track, album: { ...base.track.album, id: ALBUM } },
        },
      } as QueueItem["metadataSources"],
    }
    expect(sourceAlbumOf(item)).toEqual({ sourceId: "spotify", albumId: ALBUM })
    expect(sourceAlbumOf({ ...item, metadataSources: null })).toBeUndefined()
  })

  it("matches a picked record by album and returns its sleeve", async () => {
    const { module } = setup()
    await module.registerPicks([
      { ...HARVEST, imageUrl: COVER },
      { ...HARVEST, format: "CD" },
    ])
    const frames = module.resolveSourceRecordFrames([
      { sourceId: "spotify", albumId: ALBUM },
      { sourceId: "spotify", albumId: "zuma" },
      { sourceId: "tidal", albumId: ALBUM },
    ])
    expect([...frames.keys()]).toEqual([`spotify:${ALBUM}`])
    // LP and CD picks share the album; the first by shortId (CD) wins.
    expect(frames.get(`spotify:${ALBUM}`)).toEqual({ artworkFrame: "jewel-case" })
  })

  it("attaches the sleeve and persisted condition in Now Playing", async () => {
    const { module, context } = setup()
    await module.registerPicks([{ ...HARVEST, imageUrl: COVER }])
    const plugin = new ItemShopsPlugin()
    const internals = plugin as unknown as {
      context: PluginContext
      localLibrary: LocalLibraryModule
      getConfig: () => Promise<unknown>
    }
    internals.context = context
    internals.localLibrary = module
    internals.getConfig = async () => ({ ...defaultItemShopsConfig, enabled: true })

    await expect(plugin.augmentNowPlaying(spotifyTrack(ALBUM, "good"))).resolves.toEqual({
      physicalMediaFrame: { artworkFrame: "record-jacket", imageUrl: COVER, condition: "good" },
    })
    await expect(plugin.augmentNowPlaying(spotifyTrack("zuma"))).resolves.toEqual({})
  })
})
