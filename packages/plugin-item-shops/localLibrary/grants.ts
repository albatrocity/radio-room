import type { InventoryItem, ItemDefinition, LucideIconName } from "@repo/types"
import type { ItemCatalogEntry, LocalLibraryGrant } from "@repo/plugin-base/helpers"
import type { LocalLibraryGrantConfig } from "./config"

export type LocalCatalogScope =
  | { mode: "unrestricted" }
  | {
      mode: "playlists"
      playlistIds: string[]
      playlistKeys: string[]
      albumIds: string[]
      albumKeys: string[]
    }
  | { mode: "none" }

export type HeldLocalLibraryGrant = {
  definitionId: string
  shortId: string
  name: string
  itemId: string
  grant: LocalLibraryGrant
}

export function definitionIdForShortId(pluginName: string, shortId: string): string {
  return `${pluginName}:${shortId}`
}

function redemptionOf(row: LocalLibraryGrantConfig): LocalLibraryGrant["redemption"] {
  return row.redemption === "durable" ? "durable" : "perQueue"
}

/** Config row → catalog entry (+ grant metadata). `playlistKey` is the row `shortId`. */
export function grantConfigToCatalogEntry(row: LocalLibraryGrantConfig): ItemCatalogEntry {
  const redemption = redemptionOf(row)
  const localLibraryGrant: LocalLibraryGrant =
    row.scope === "library"
      ? { scope: "library", redemption }
      : { scope: "playlist", playlistKey: row.shortId, redemption }

  return {
    definition: {
      shortId: row.shortId,
      name: row.name,
      description: row.description,
      icon: (row.icon as LucideIconName | undefined) ?? "Disc",
      stackable: row.stackable,
      maxStack: row.maxStack,
      tradeable: row.tradeable,
      consumable: row.consumable,
      coinValue: row.coinValue,
      rarity: row.rarity,
      slotPool: redemption === "durable" ? "collection" : "inventory",
    },
    localLibraryGrant,
  }
}

export function buildGrantCatalogEntries(
  rows: readonly LocalLibraryGrantConfig[],
): ItemCatalogEntry[] {
  return rows.map(grantConfigToCatalogEntry)
}

/** shortId (playlistKey) → Navidrome playlist id for playlist-scoped rows. */
export function playlistMapFromGrantConfig(
  rows: readonly LocalLibraryGrantConfig[],
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const row of rows) {
    if (row.scope !== "playlist") continue
    const id = row.playlistId?.trim() ?? ""
    if (id) out[row.shortId] = id
  }
  return out
}

export function catalogByShortId(
  catalog: readonly ItemCatalogEntry[],
): Map<string, ItemCatalogEntry> {
  const m = new Map<string, ItemCatalogEntry>()
  for (const e of catalog) {
    m.set(e.definition.shortId, e)
  }
  return m
}

export function isLocalLibraryGrantShortId(
  shortId: string,
  catalog: readonly ItemCatalogEntry[],
): boolean {
  return catalogByShortId(catalog).get(shortId)?.localLibraryGrant != null
}

/**
 * Inventory stacks that carry a localLibraryGrant (deterministic shortId order).
 */
export function listHeldLocalLibraryGrants(params: {
  pluginName: string
  items: InventoryItem[]
  grantCatalog: readonly ItemCatalogEntry[]
  definitionById?: Map<string, ItemDefinition>
}): HeldLocalLibraryGrant[] {
  const byShort = catalogByShortId(params.grantCatalog)
  const out: HeldLocalLibraryGrant[] = []
  for (const item of params.items) {
    if (item.quantity <= 0) continue
    const shortId = item.definitionId.includes(":")
      ? item.definitionId.slice(item.definitionId.indexOf(":") + 1)
      : item.definitionId
    const entry = byShort.get(shortId)
    const grant = entry?.localLibraryGrant
    if (!grant) continue
    if (
      item.definitionId !== definitionIdForShortId(params.pluginName, shortId) &&
      !item.definitionId.endsWith(`:${shortId}`)
    ) {
      continue
    }
    out.push({
      definitionId: item.definitionId,
      shortId,
      name: entry!.definition.name,
      itemId: item.itemId,
      grant,
    })
  }
  out.sort((a, b) => a.definitionId.localeCompare(b.definitionId))
  return out
}

export function resolveLocalCatalogScope(params: {
  pluginName: string
  items: InventoryItem[]
  grantCatalog: readonly ItemCatalogEntry[]
  /** playlistKey (shortId) → Navidrome playlist id */
  localLibraryPlaylists: Record<string, string>
  /** albumKey (shortId) → Navidrome album id */
  localLibraryAlbums?: Record<string, string>
}): LocalCatalogScope {
  const held = listHeldLocalLibraryGrants({
    pluginName: params.pluginName,
    items: params.items,
    grantCatalog: params.grantCatalog,
  })
  if (held.length === 0) return { mode: "none" }
  if (held.some((h) => h.grant.scope === "library")) {
    return { mode: "unrestricted" }
  }

  const playlistIds: string[] = []
  const playlistKeys: string[] = []
  const albumIds: string[] = []
  const albumKeys: string[] = []
  const seenPlaylists = new Set<string>()
  const seenAlbums = new Set<string>()
  const albumMap = params.localLibraryAlbums ?? {}

  for (const h of held) {
    if (h.grant.scope === "playlist") {
      const id = params.localLibraryPlaylists[h.grant.playlistKey]?.trim()
      if (!id || seenPlaylists.has(id)) continue
      seenPlaylists.add(id)
      playlistIds.push(id)
      playlistKeys.push(h.grant.playlistKey)
    } else if (h.grant.scope === "album") {
      const id = albumMap[h.grant.albumKey]?.trim()
      if (!id || seenAlbums.has(id)) continue
      seenAlbums.add(id)
      albumIds.push(id)
      albumKeys.push(h.grant.albumKey)
    }
  }
  if (playlistIds.length === 0 && albumIds.length === 0) return { mode: "none" }
  return { mode: "playlists", playlistIds, playlistKeys, albumIds, albumKeys }
}

/**
 * Prefer a per-queue burned CD whose playlist contains the track; else another
 * per-queue library-scope grant. Durable grants are never consumed.
 */
export function pickGrantToConsume(params: {
  held: HeldLocalLibraryGrant[]
  trackInPlaylistKey: Record<string, boolean>
}): HeldLocalLibraryGrant | null {
  const { held, trackInPlaylistKey } = params
  const consumable = held.filter((h) => h.grant.redemption !== "durable")
  if (consumable.length === 0) return null

  const shelfMatches = consumable.filter(
    (h) =>
      h.grant.scope === "playlist" && trackInPlaylistKey[h.grant.playlistKey] === true,
  )
  if (shelfMatches.length > 0) {
    return shelfMatches[0]!
  }

  const library = consumable.find((h) => h.grant.scope === "library")
  return library ?? null
}

/** Passive Use message for grant items (they redeem on queue, not Use). */
export const LOCAL_LIBRARY_GRANT_USE_MESSAGE =
  "Keep this in your inventory. Open Add to Queue and pick a Library track — it's spent when the song is added."
