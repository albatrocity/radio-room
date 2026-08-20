import { describe, expect, it } from "vitest"
import {
  buildGrantCatalogEntries,
  listHeldLocalLibraryGrants,
  pickGrantToConsume,
  playlistMapFromGrantConfig,
  resolveLocalCatalogScope,
} from "./localLibraryGrants"
import type { LocalLibraryGrantConfig } from "./types"

const PLUGIN = "item-shops"
const BB = "burned-cd-bargain-bin"
const CARD = "library-pass"
const POETRY = "burned-cd-poetry"
const PM = "pm-loveless"

function grant(
  partial: Pick<LocalLibraryGrantConfig, "shortId" | "name" | "scope"> &
    Partial<LocalLibraryGrantConfig>,
): LocalLibraryGrantConfig {
  return {
    description: "",
    stackable: true,
    maxStack: 5,
    tradeable: true,
    consumable: false,
    playlistId: "",
    redemption: "perQueue",
    ...partial,
  }
}

const CARD_GRANT = grant({
  shortId: CARD,
  name: "Library Pass",
  scope: "library",
  icon: "IdCard",
  coinValue: 100,
  rarity: "legendary",
  maxStack: 3,
})

const BB_GRANT = grant({
  shortId: BB,
  name: "Burned CD: Bargain Bin",
  scope: "playlist",
  icon: "Disc",
  coinValue: 15,
})

const grantCatalog = buildGrantCatalogEntries([BB_GRANT, CARD_GRANT])

function stack(shortId: string, quantity = 1, itemId = `id-${shortId}`) {
  return {
    itemId,
    definitionId: `${PLUGIN}:${shortId}`,
    sourcePlugin: PLUGIN,
    quantity,
    acquiredAt: Date.now(),
  }
}

function poetryGrant(playlistId: string): LocalLibraryGrantConfig {
  return grant({
    shortId: POETRY,
    name: "Burned CD: Poetry",
    scope: "playlist",
    playlistId,
  })
}

describe("localLibraryGrants", () => {
  it("lists held grants from inventory against grant catalog", () => {
    const held = listHeldLocalLibraryGrants({
      pluginName: PLUGIN,
      items: [stack(BB), stack(CARD), stack("scratched-cd")],
      grantCatalog,
    })
    expect(held.map((h) => h.shortId).sort()).toEqual([BB, CARD].sort())
  })

  it("resolves unrestricted when any library-scope grant is held", () => {
    const grants = [BB_GRANT, CARD_GRANT].map((g) =>
      g.shortId === BB ? { ...g, playlistId: "pl-1" } : g,
    )
    const scope = resolveLocalCatalogScope({
      pluginName: PLUGIN,
      items: [stack(BB), stack(CARD)],
      grantCatalog: buildGrantCatalogEntries(grants),
      localLibraryPlaylists: playlistMapFromGrantConfig(grants),
    })
    expect(scope).toEqual({ mode: "unrestricted" })
  })

  it("unions mapped playlist ids for burned CDs", () => {
    const grants = [{ ...BB_GRANT, playlistId: "pl-bb" }, poetryGrant("pl-poetry")]
    const scope = resolveLocalCatalogScope({
      pluginName: PLUGIN,
      items: [stack(BB), stack(POETRY), stack("scratched-cd")],
      grantCatalog: buildGrantCatalogEntries(grants),
      localLibraryPlaylists: playlistMapFromGrantConfig(grants),
    })
    expect(scope).toEqual({
      mode: "playlists",
      playlistIds: ["pl-bb", "pl-poetry"],
      playlistKeys: [BB, POETRY],
    })
  })

  it("returns none when burned CDs have no mapped playlist ids", () => {
    const scope = resolveLocalCatalogScope({
      pluginName: PLUGIN,
      items: [stack(BB)],
      grantCatalog,
      localLibraryPlaylists: {},
    })
    expect(scope).toEqual({ mode: "none" })
  })

  it("prefers a matching burned CD over a library-scope grant", () => {
    const held = listHeldLocalLibraryGrants({
      pluginName: PLUGIN,
      items: [stack(CARD, 1, "card"), stack(BB, 1, "bb")],
      grantCatalog,
    })
    const pick = pickGrantToConsume({
      held,
      trackInPlaylistKey: { [BB]: true },
    })
    expect(pick?.shortId).toBe(BB)
  })

  it("falls back to a library-scope grant when track is not on a shelf", () => {
    const held = listHeldLocalLibraryGrants({
      pluginName: PLUGIN,
      items: [stack(CARD, 1, "card"), stack(BB, 1, "bb")],
      grantCatalog,
    })
    const pick = pickGrantToConsume({
      held,
      trackInPlaylistKey: { [BB]: false },
    })
    expect(pick?.shortId).toBe(CARD)
  })

  it("does not consume durable grants", () => {
    const durableCatalog = buildGrantCatalogEntries([
      grant({
        shortId: PM,
        name: "LP: Loveless",
        scope: "playlist",
        playlistId: "pl-1",
        redemption: "durable",
      }),
    ])
    const held = listHeldLocalLibraryGrants({
      pluginName: PLUGIN,
      items: [stack(PM, 1, "pm")],
      grantCatalog: durableCatalog,
    })
    expect(held[0]?.grant.redemption).toBe("durable")
    const pick = pickGrantToConsume({
      held,
      trackInPlaylistKey: { [PM]: true },
    })
    expect(pick).toBeNull()
  })
})
