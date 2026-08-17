import { describe, expect, it } from "vitest"
import {
  buildGrantCatalogEntries,
  listHeldLocalLibraryGrants,
  pickGrantToConsume,
  playlistMapFromGrantConfig,
  resolveLocalCatalogScope,
} from "./localLibraryGrants"
import { DEFAULT_LOCAL_LIBRARY_GRANTS } from "./types"

const PLUGIN = "item-shops"
const grantCatalog = buildGrantCatalogEntries(DEFAULT_LOCAL_LIBRARY_GRANTS)

function stack(shortId: string, quantity = 1, itemId = `id-${shortId}`) {
  return {
    itemId,
    definitionId: `${PLUGIN}:${shortId}`,
    sourcePlugin: PLUGIN,
    quantity,
    acquiredAt: Date.now(),
  }
}

describe("localLibraryGrants", () => {
  it("lists held grants from inventory against grant catalog", () => {
    const held = listHeldLocalLibraryGrants({
      pluginName: PLUGIN,
      items: [
        stack("bargain-bin-sticker"),
        stack("thrift-store-coupon"),
        stack("scratched-cd"),
      ],
      grantCatalog,
    })
    expect(held.map((h) => h.shortId).sort()).toEqual(
      ["bargain-bin-sticker", "thrift-store-coupon"].sort(),
    )
  })

  it("resolves unrestricted when any library-scope grant is held", () => {
    const grants = DEFAULT_LOCAL_LIBRARY_GRANTS.map((g) =>
      g.shortId === "bargain-bin-sticker" ? { ...g, playlistId: "pl-1" } : g,
    )
    const scope = resolveLocalCatalogScope({
      pluginName: PLUGIN,
      items: [stack("bargain-bin-sticker"), stack("thrift-store-coupon")],
      grantCatalog: buildGrantCatalogEntries(grants),
      localLibraryPlaylists: playlistMapFromGrantConfig(grants),
    })
    expect(scope).toEqual({ mode: "unrestricted" })
  })

  it("unions mapped playlist ids for shelf stickers", () => {
    const grants = DEFAULT_LOCAL_LIBRARY_GRANTS.map((g) => {
      if (g.shortId === "bargain-bin-sticker") return { ...g, playlistId: "pl-bb" }
      if (g.shortId === "local-heroes-sticker") return { ...g, playlistId: "pl-lh" }
      return g
    })
    const scope = resolveLocalCatalogScope({
      pluginName: PLUGIN,
      items: [
        stack("bargain-bin-sticker"),
        stack("local-heroes-sticker"),
        stack("unreleased-sticker"),
      ],
      grantCatalog: buildGrantCatalogEntries(grants),
      localLibraryPlaylists: playlistMapFromGrantConfig(grants),
    })
    expect(scope).toEqual({
      mode: "playlists",
      playlistIds: ["pl-bb", "pl-lh"],
      playlistKeys: ["bargain-bin-sticker", "local-heroes-sticker"],
    })
  })

  it("returns none when stickers have no mapped playlist ids", () => {
    const scope = resolveLocalCatalogScope({
      pluginName: PLUGIN,
      items: [stack("bargain-bin-sticker")],
      grantCatalog,
      localLibraryPlaylists: {},
    })
    expect(scope).toEqual({ mode: "none" })
  })

  it("prefers a matching shelf sticker over the full-library coupon", () => {
    const held = listHeldLocalLibraryGrants({
      pluginName: PLUGIN,
      items: [
        stack("thrift-store-coupon", 1, "coupon"),
        stack("bargain-bin-sticker", 1, "bb"),
      ],
      grantCatalog,
    })
    const pick = pickGrantToConsume({
      held,
      trackInPlaylistKey: { "bargain-bin-sticker": true },
    })
    expect(pick?.shortId).toBe("bargain-bin-sticker")
  })

  it("falls back to full-library coupon when track is not on a shelf", () => {
    const held = listHeldLocalLibraryGrants({
      pluginName: PLUGIN,
      items: [
        stack("thrift-store-coupon", 1, "coupon"),
        stack("bargain-bin-sticker", 1, "bb"),
      ],
      grantCatalog,
    })
    const pick = pickGrantToConsume({
      held,
      trackInPlaylistKey: { "bargain-bin-sticker": false },
    })
    expect(pick?.shortId).toBe("thrift-store-coupon")
  })
})
