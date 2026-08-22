import { describe, expect, it, vi } from "vitest"
import { LocalLibraryModule } from "./index"
import { physicalMediaAlbumShortId, physicalMediaShortId } from "./physicalMedia"
import type { PluginContext } from "@repo/types"

function bridgeContext(api: Record<string, unknown>): PluginContext {
  return {
    roomId: "room-1",
    getRoom: async () => ({ playbackControllerId: "bridge" }),
    api,
  } as unknown as PluginContext
}

describe("LocalLibraryModule refresh rarity", () => {
  it("applies Navidrome userRating to catalog-mode album SKUs", async () => {
    const api = {
      listLocalPlaylists: vi.fn(async () => []),
      getLocalPlaylistArtwork: vi.fn(async () => ({})),
      listLibraryAlbums: vi.fn(async () => [
        {
          id: "al-1",
          name: "Loveless",
          year: 1991,
          songCount: 11,
          userRating: 5,
        },
      ]),
    }
    const mod = new LocalLibraryModule("item-shops", () => bridgeContext(api))
    await mod.refreshDerivedPhysicalMedia([], {
      derivePrefixedPlaylists: false,
      deriveAlbums: true,
    })
    const item = mod.derivedPhysicalMedia.find(
      (e) => e.definition.shortId === physicalMediaAlbumShortId("al-1"),
    )
    expect(item?.definition.rarity).toBe("legendary")
  })

  it("inherits album userRating onto a prefixed playlist that shadows the album", async () => {
    const api = {
      listLocalPlaylists: vi.fn(async () => [
        { id: "nd-1", name: "[LP] Loveless", songCount: 2 },
      ]),
      getLocalPlaylistArtwork: vi.fn(async () => ({})),
      listLibraryAlbums: vi.fn(async () => [
        { id: "al-1", name: "Loveless", year: 1991, songCount: 2, userRating: 5 },
      ]),
      listLocalPlaylistTrackIds: vi.fn(async () => [
        { id: "t1", albumId: "al-1" },
        { id: "t2", albumId: "al-1" },
      ]),
      listLocalAlbumTrackIds: vi.fn(async () => ["t1", "t2"]),
    }
    const mod = new LocalLibraryModule("item-shops", () => bridgeContext(api))
    await mod.refreshDerivedPhysicalMedia([], {
      derivePrefixedPlaylists: true,
      deriveAlbums: true,
    })
    const playlistItem = mod.derivedPhysicalMedia.find(
      (e) => e.definition.shortId === physicalMediaShortId("nd-1"),
    )
    const albumItem = mod.derivedPhysicalMedia.find(
      (e) => e.definition.shortId === physicalMediaAlbumShortId("al-1"),
    )
    expect(playlistItem?.definition.rarity).toBe("legendary")
    expect(albumItem).toBeUndefined()
  })
})
