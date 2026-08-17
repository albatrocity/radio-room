import { describe, expect, it } from "vitest"
import {
  listHeldLocalLibraryGrants,
  pickGrantToConsume,
  resolveLocalCatalogScope,
} from "./localLibraryGrants"
import { items } from "./items"

const PLUGIN = "item-shops"

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
  it("lists held grants from inventory", () => {
    const held = listHeldLocalLibraryGrants({
      pluginName: PLUGIN,
      items: [
        stack(items.bargainBinSticker.shortId),
        stack(items.thriftStoreCoupon.shortId),
        stack(items.scratchedCd.shortId),
      ],
    })
    expect(held.map((h) => h.shortId).sort()).toEqual(
      [items.bargainBinSticker.shortId, items.thriftStoreCoupon.shortId].sort(),
    )
  })

  it("resolves unrestricted when any library-scope grant is held", () => {
    const scope = resolveLocalCatalogScope({
      pluginName: PLUGIN,
      items: [
        stack(items.bargainBinSticker.shortId),
        stack(items.thriftStoreCoupon.shortId),
      ],
      localLibraryPlaylists: { "bargain-bin": "pl-1" },
    })
    expect(scope).toEqual({ mode: "unrestricted" })
  })

  it("unions mapped playlist ids for shelf stickers", () => {
    const scope = resolveLocalCatalogScope({
      pluginName: PLUGIN,
      items: [
        stack(items.bargainBinSticker.shortId),
        stack(items.localHeroesSticker.shortId),
        stack(items.unreleasedSticker.shortId),
      ],
      localLibraryPlaylists: {
        "bargain-bin": "pl-bb",
        "local-heroes": "pl-lh",
        // unreleased unmapped → fail closed for that key
      },
    })
    expect(scope).toEqual({
      mode: "playlists",
      playlistIds: ["pl-bb", "pl-lh"],
      playlistKeys: ["bargain-bin", "local-heroes"],
    })
  })

  it("returns none when stickers have no mapped playlist ids", () => {
    const scope = resolveLocalCatalogScope({
      pluginName: PLUGIN,
      items: [stack(items.bargainBinSticker.shortId)],
      localLibraryPlaylists: {},
    })
    expect(scope).toEqual({ mode: "none" })
  })

  it("prefers a matching shelf sticker over the full-library coupon", () => {
    const held = listHeldLocalLibraryGrants({
      pluginName: PLUGIN,
      items: [
        stack(items.thriftStoreCoupon.shortId, 1, "coupon"),
        stack(items.bargainBinSticker.shortId, 1, "bb"),
      ],
    })
    const pick = pickGrantToConsume({
      held,
      trackInPlaylistKey: { "bargain-bin": true },
    })
    expect(pick?.shortId).toBe(items.bargainBinSticker.shortId)
  })

  it("falls back to full-library coupon when track is not on a shelf", () => {
    const held = listHeldLocalLibraryGrants({
      pluginName: PLUGIN,
      items: [
        stack(items.thriftStoreCoupon.shortId, 1, "coupon"),
        stack(items.bargainBinSticker.shortId, 1, "bb"),
      ],
    })
    const pick = pickGrantToConsume({
      held,
      trackInPlaylistKey: { "bargain-bin": false },
    })
    expect(pick?.shortId).toBe(items.thriftStoreCoupon.shortId)
  })
})
