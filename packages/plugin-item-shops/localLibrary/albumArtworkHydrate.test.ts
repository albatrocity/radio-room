import { describe, expect, it, vi } from "vitest"
import { LocalLibraryModule } from "./index"
import { physicalMediaAlbumShortId } from "./physicalMedia"
import type { ItemCatalogEntry } from "@repo/plugin-base/helpers"
import type { PluginContext } from "@repo/types"

function albumEntry(albumId: string, withArt?: boolean): ItemCatalogEntry {
  const shortId = physicalMediaAlbumShortId(albumId)
  return {
    definition: {
      shortId,
      name: `CD: ${albumId}`,
      description: "A CD from the Record Store.",
      icon: "Disc3",
      artworkFrame: "jewel-case",
      ...(withArt ? { imageUrl: `/img/${albumId}` } : {}),
      stackable: true,
      maxStack: 5,
      tradeable: true,
      consumable: false,
      coinValue: 20,
      rarity: "common",
      slotPool: "collection",
    },
    localLibraryGrant: {
      scope: "album",
      albumKey: shortId,
      redemption: "durable",
    },
  }
}

function moduleWithAlbums(
  albumIds: string[],
  catalog: Partial<PluginContext["catalog"]> = {},
  withArt: readonly string[] = [],
): LocalLibraryModule {
  const context = {
    roomId: "room-1",
    catalog: {
      getLocalAlbumArtwork: vi.fn(async () => ({})),
      getLocalAlbumComments: vi.fn(async () => ({})),
      ...catalog,
    },
  } as unknown as PluginContext
  const mod = new LocalLibraryModule("item-shops", () => context)
  mod.derivedPhysicalMedia = albumIds.map((id) => albumEntry(id, withArt.includes(id)))
  ;(mod as unknown as { derivedAlbumMap: Record<string, string> }).derivedAlbumMap =
    Object.fromEntries(albumIds.map((id) => [physicalMediaAlbumShortId(id), id]))
  return mod
}

describe("LocalLibraryModule album artwork hydrate", () => {
  it("applyAlbumArtwork patches missing sleeves", () => {
    const mod = moduleWithAlbums(["al-1", "al-2"], {}, ["al-2"])

    const changed = mod.applyAlbumArtwork({
      "al-1": { imageUrl: "/new-1", imageUrlLarge: "/new-1-lg" },
      "al-2": { imageUrl: "/img/al-2" },
    })
    expect(changed).toEqual([physicalMediaAlbumShortId("al-1")])
    expect(mod.derivedPhysicalMedia[0]?.definition.imageUrl).toBe("/new-1")
    expect(mod.derivedPhysicalMedia[0]?.definition.imageUrlLarge).toBe("/new-1-lg")
    expect(mod.derivedPhysicalMedia[1]?.definition.imageUrl).toBe("/img/al-2")
  })

  it("ensureAlbumArtworkForShortIds fetches only missing albums", async () => {
    const getLocalAlbumArtwork = vi.fn(async (_roomId: string, ids: string[]) => {
      const out: Record<string, { imageUrl: string }> = {}
      for (const id of ids) out[id] = { imageUrl: `/art/${id}` }
      return out
    })
    const mod = moduleWithAlbums(["al-1", "al-2"], { getLocalAlbumArtwork }, ["al-2"])
    const short1 = physicalMediaAlbumShortId("al-1")
    const short2 = physicalMediaAlbumShortId("al-2")

    await expect(mod.ensureAlbumArtworkForShortIds([short1, short2])).resolves.toEqual([short1])
    expect(getLocalAlbumArtwork).toHaveBeenCalledWith("room-1", ["al-1"])
    expect(mod.derivedPhysicalMedia[0]?.definition.imageUrl).toBe("/art/al-1")
  })

  it("hydrateMissingAlbumArtwork batches and stops when caught up", async () => {
    const calls: string[][] = []
    const getLocalAlbumArtwork = vi.fn(async (_roomId: string, ids: string[]) => {
      calls.push(ids)
      const out: Record<string, { imageUrl: string }> = {}
      for (const id of ids) out[id] = { imageUrl: `/art/${id}` }
      return out
    })
    const mod = moduleWithAlbums(["a", "b", "c", "d", "e"], { getLocalAlbumArtwork })

    const onBatch = vi.fn()
    await mod.hydrateMissingAlbumArtwork({ batchSize: 2, onBatch })
    expect(calls).toEqual([["a", "b"], ["c", "d"], ["e"]])
    expect(onBatch).toHaveBeenCalledTimes(3)
    expect(mod.albumIdsMissingArtwork()).toEqual([])
  })

  it("hydrate does not spin when covers are missing from the daemon", async () => {
    const getLocalAlbumArtwork = vi.fn(async () => ({}))
    const mod = moduleWithAlbums(["al-x"], { getLocalAlbumArtwork })

    await mod.hydrateMissingAlbumArtwork({ batchSize: 10 })
    expect(getLocalAlbumArtwork).toHaveBeenCalledTimes(1)
    expect(mod.albumIdsMissingArtwork()).toEqual([])
  })
})

describe("LocalLibraryModule album lore", () => {
  it("applyAlbumLore sets lore and keeps the canned description", () => {
    const mod = moduleWithAlbums(["al-1", "al-2"])

    const changed = mod.applyAlbumLore({ "al-1": "  Recorded in **one** night.  " })
    expect(changed).toEqual([physicalMediaAlbumShortId("al-1")])
    expect(mod.derivedPhysicalMedia[0]?.definition.lore).toBe("Recorded in **one** night.")
    expect(mod.derivedPhysicalMedia[0]?.definition.description).toBe("A CD from the Record Store.")
    expect(mod.derivedPhysicalMedia[1]?.definition.lore).toBeUndefined()
  })

  it("applyAlbumLore ignores blank comments and unchanged lore", () => {
    const mod = moduleWithAlbums(["al-1"])
    expect(mod.applyAlbumLore({ "al-1": "   " })).toEqual([])
    expect(mod.applyAlbumLore({ "al-1": "Same" })).toHaveLength(1)
    expect(mod.applyAlbumLore({ "al-1": "Same" })).toEqual([])
  })

  it("hydrate fetches lore with sleeves and reports lore-only changes", async () => {
    const getLocalAlbumComments = vi.fn(
      async (_roomId: string, ids: string[]): Promise<Record<string, string>> =>
        ids.includes("al-1") ? { "al-1": "Liner notes." } : {},
    )
    const mod = moduleWithAlbums(["al-1", "al-2"], { getLocalAlbumComments })

    const onBatch = vi.fn()
    await mod.hydrateMissingAlbumArtwork({ batchSize: 10, onBatch })
    expect(getLocalAlbumComments).toHaveBeenCalledWith("room-1", ["al-1", "al-2"])
    expect(onBatch).toHaveBeenCalledWith([physicalMediaAlbumShortId("al-1")])
    expect(mod.derivedPhysicalMedia[0]?.definition.lore).toBe("Liner notes.")
  })

  it("ensureAlbumArtworkForShortIds also fills lore", async () => {
    const getLocalAlbumComments = vi.fn(async () => ({ "al-1": "Liner notes." }))
    const mod = moduleWithAlbums(["al-1"], { getLocalAlbumComments })
    const short1 = physicalMediaAlbumShortId("al-1")

    await expect(mod.ensureAlbumArtworkForShortIds([short1])).resolves.toEqual([short1])
    expect(mod.derivedPhysicalMedia[0]?.definition.lore).toBe("Liner notes.")
  })
})
