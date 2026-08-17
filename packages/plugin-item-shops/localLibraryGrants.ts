import type { InventoryItem, ItemDefinition } from "@repo/types"
import type { ItemCatalogEntry, LocalLibraryGrant } from "@repo/plugin-base/helpers"
import { ITEM_CATALOG } from "./items/index"

export const LOCAL_LIBRARY_PLAYLIST_KEYS = [
  "bargain-bin",
  "out-of-print",
  "local-heroes",
  "unreleased",
] as const

export type LocalLibraryPlaylistKey = (typeof LOCAL_LIBRARY_PLAYLIST_KEYS)[number]

export type LocalCatalogScope =
  | { mode: "unrestricted" }
  | { mode: "playlists"; playlistIds: string[]; playlistKeys: string[] }
  | { mode: "none" }

export type HeldLocalLibraryGrant = {
  definitionId: string
  shortId: string
  name: string
  itemId: string
  grant: LocalLibraryGrant
}

function catalogByShortId(): Map<string, ItemCatalogEntry> {
  const m = new Map<string, ItemCatalogEntry>()
  for (const e of ITEM_CATALOG) {
    m.set(e.definition.shortId, e)
  }
  return m
}

export function isLocalLibraryGrantShortId(shortId: string): boolean {
  const entry = catalogByShortId().get(shortId)
  return entry?.localLibraryGrant != null
}

export function definitionIdForShortId(pluginName: string, shortId: string): string {
  return `${pluginName}:${shortId}`
}

/**
 * Inventory stacks that carry a localLibraryGrant, newest/lowest definitionId first for
 * deterministic consume when a track is in multiple playlists.
 */
export function listHeldLocalLibraryGrants(params: {
  pluginName: string
  items: InventoryItem[]
  definitionById?: Map<string, ItemDefinition>
}): HeldLocalLibraryGrant[] {
  const byShort = catalogByShortId()
  const out: HeldLocalLibraryGrant[] = []
  for (const item of params.items) {
    if (item.quantity <= 0) continue
    const shortId = item.definitionId.includes(":")
      ? item.definitionId.slice(item.definitionId.indexOf(":") + 1)
      : item.definitionId
    const entry = byShort.get(shortId)
    const grant = entry?.localLibraryGrant
    if (!grant) continue
    // Prefer definitionId that matches plugin prefix
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
  /** playlistKey → Navidrome playlist id */
  localLibraryPlaylists: Record<string, string>
}): LocalCatalogScope {
  const held = listHeldLocalLibraryGrants({
    pluginName: params.pluginName,
    items: params.items,
  })
  if (held.length === 0) return { mode: "none" }
  if (held.some((h) => h.grant.scope === "library")) {
    return { mode: "unrestricted" }
  }

  const playlistIds: string[] = []
  const playlistKeys: string[] = []
  const seen = new Set<string>()
  for (const h of held) {
    if (h.grant.scope !== "playlist") continue
    const id = params.localLibraryPlaylists[h.grant.playlistKey]?.trim()
    if (!id) continue
    if (seen.has(id)) continue
    seen.add(id)
    playlistIds.push(id)
    playlistKeys.push(h.grant.playlistKey)
  }
  if (playlistIds.length === 0) return { mode: "none" }
  return { mode: "playlists", playlistIds, playlistKeys }
}

/**
 * Pick which stack to redeem for a queued local track.
 * Prefer a playlist sticker whose playlist contains the track; else full-library coupon.
 */
export function pickGrantToConsume(params: {
  held: HeldLocalLibraryGrant[]
  /** playlistKey → whether track is a member */
  trackInPlaylistKey: Record<string, boolean>
}): HeldLocalLibraryGrant | null {
  const { held, trackInPlaylistKey } = params
  if (held.length === 0) return null

  const shelfMatches = held.filter(
    (h) =>
      h.grant.scope === "playlist" && trackInPlaylistKey[h.grant.playlistKey] === true,
  )
  if (shelfMatches.length > 0) {
    return shelfMatches[0]!
  }

  const library = held.find((h) => h.grant.scope === "library")
  return library ?? null
}
