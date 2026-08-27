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
      description: "",
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

describe("LocalLibraryModule album artwork hydrate", () => {
  it("applyAlbumArtwork patches missing sleeves", () => {
    const mod = new LocalLibraryModule("item-shops", () => undefined)
    mod.derivedPhysicalMedia = [albumEntry("al-1"), albumEntry("al-2", true)]
    ;(mod as unknown as { derivedAlbumMap: Record<string, string> }).derivedAlbumMap = {
      [physicalMediaAlbumShortId("al-1")]: "al-1",
      [physicalMediaAlbumShortId("al-2")]: "al-2",
    }

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
    const context = {
      roomId: "room-1",
      api: { getLocalAlbumArtwork },
    } as unknown as PluginContext
    const mod = new LocalLibraryModule("item-shops", () => context)
    const short1 = physicalMediaAlbumShortId("al-1")
    const short2 = physicalMediaAlbumShortId("al-2")
    mod.derivedPhysicalMedia = [albumEntry("al-1"), albumEntry("al-2", true)]
    ;(mod as unknown as { derivedAlbumMap: Record<string, string> }).derivedAlbumMap = {
      [short1]: "al-1",
      [short2]: "al-2",
    }

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
    const context = {
      roomId: "room-1",
      api: { getLocalAlbumArtwork },
    } as unknown as PluginContext
    const mod = new LocalLibraryModule("item-shops", () => context)
    const albumIds = ["a", "b", "c", "d", "e"]
    mod.derivedPhysicalMedia = albumIds.map((id) => albumEntry(id))
    ;(mod as unknown as { derivedAlbumMap: Record<string, string> }).derivedAlbumMap = Object.fromEntries(
      albumIds.map((id) => [physicalMediaAlbumShortId(id), id]),
    )

    const onBatch = vi.fn()
    await mod.hydrateMissingAlbumArtwork({ batchSize: 2, onBatch })
    expect(calls).toEqual([["a", "b"], ["c", "d"], ["e"]])
    expect(onBatch).toHaveBeenCalledTimes(3)
    expect(mod.albumIdsMissingArtwork()).toEqual([])
  })

  it("hydrate does not spin when covers are missing from the daemon", async () => {
    const getLocalAlbumArtwork = vi.fn(async () => ({}))
    const context = {
      roomId: "room-1",
      api: { getLocalAlbumArtwork },
    } as unknown as PluginContext
    const mod = new LocalLibraryModule("item-shops", () => context)
    mod.derivedPhysicalMedia = [albumEntry("al-x")]
    ;(mod as unknown as { derivedAlbumMap: Record<string, string> }).derivedAlbumMap = {
      [physicalMediaAlbumShortId("al-x")]: "al-x",
    }

    await mod.hydrateMissingAlbumArtwork({ batchSize: 10 })
    expect(getLocalAlbumArtwork).toHaveBeenCalledTimes(1)
    expect(mod.albumIdsMissingArtwork()).toEqual([])
  })
})
