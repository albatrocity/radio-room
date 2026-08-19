import type { ItemCatalogEntry } from "@repo/plugin-base/helpers"
import type { ArtworkFrame, ItemRarity, LucideIconName } from "@repo/types"
import type { PhysicalMediaOverride } from "./config"

export const PHYSICAL_MEDIA_PREFIXES = [
  { prefix: "[CD]", format: "CD", icon: "Disc" as LucideIconName, artworkFrame: "jewel-case" as ArtworkFrame },
  { prefix: "[LP]", format: "LP", icon: "Disc3" as LucideIconName, artworkFrame: "record-jacket" as ArtworkFrame },
  { prefix: "[TAPE]", format: "Cassette", icon: "CassetteTape" as LucideIconName, artworkFrame: "cassette-case" as ArtworkFrame },
  { prefix: "[45]", format: "45", icon: "DiscAlbum" as LucideIconName, artworkFrame: "die-cut-jacket" as ArtworkFrame },
] as const

export type PhysicalMediaPlaylist = {
  id: string
  name: string
  songCount?: number
  /** Navidrome playlist comment; used as item description when non-empty. */
  comment?: string
}

export function physicalMediaShortId(playlistId: string): string {
  const safe = playlistId.trim().replace(/[^a-zA-Z0-9_-]/g, "-")
  return `pm-${safe}`
}

export function parsePhysicalMediaName(
  name: string,
): { format: string; title: string; icon: LucideIconName; artworkFrame: ArtworkFrame } | null {
  const trimmed = name.trim()
  for (const row of PHYSICAL_MEDIA_PREFIXES) {
    if (trimmed.toUpperCase().startsWith(row.prefix)) {
      const title = trimmed.slice(row.prefix.length).trim() || trimmed
      return { format: row.format, icon: row.icon, title, artworkFrame: row.artworkFrame }
    }
  }
  return null
}

export function priceFromSongCount(songCount: number): number {
  if (songCount <= 4) return 8
  if (songCount <= 12) return 20
  if (songCount <= 20) return 35
  return 50
}

export function rarityFromSongCount(songCount: number): ItemRarity {
  if (songCount <= 4) return "common"
  if (songCount <= 12) return "uncommon"
  if (songCount <= 20) return "rare"
  return "legendary"
}

export function derivePhysicalMediaItems(
  playlists: readonly PhysicalMediaPlaylist[],
  overrides: readonly PhysicalMediaOverride[] = [],
  /** Playlist cover art URLs keyed by Navidrome playlist id. */
  artworkByPlaylistId: Readonly<Record<string, { imageUrl?: string; imageUrlLarge?: string }>> = {},
): { items: ItemCatalogEntry[]; playlistMap: Record<string, string> } {
  const overrideById = new Map(overrides.map((o) => [o.playlistId.trim(), o]))
  const items: ItemCatalogEntry[] = []
  const playlistMap: Record<string, string> = {}

  for (const pl of playlists) {
    const parsed = parsePhysicalMediaName(pl.name)
    if (!parsed) continue
    const id = pl.id.trim()
    if (!id) continue
    const shortId = physicalMediaShortId(id)
    const override = overrideById.get(id)
    const songCount = pl.songCount ?? 0
    const name = override?.name?.trim() || `${parsed.format}: ${parsed.title}`
    const comment = pl.comment?.trim()
    const artwork = override?.blankDisc ? undefined : artworkByPlaylistId[id]
    const imageUrl = artwork?.imageUrl?.trim()
    const imageUrlLarge = artwork?.imageUrlLarge?.trim()
    items.push({
      definition: {
        shortId,
        name,
        description:
          comment ||
          `A ${parsed.format} from the Record Store. Queue any track on it for the rest of the session.`,
        icon: (override?.icon as LucideIconName | undefined) ?? parsed.icon,
        artworkFrame: parsed.artworkFrame,
        ...(imageUrl ? { imageUrl } : {}),
        ...(imageUrlLarge ? { imageUrlLarge } : {}),
        stackable: true,
        maxStack: 5,
        tradeable: true,
        consumable: false,
        coinValue: override?.coinValue ?? priceFromSongCount(songCount),
        rarity: override?.rarity ?? rarityFromSongCount(songCount),
        slotPool: "collection",
      },
      localLibraryGrant: {
        scope: "playlist",
        playlistKey: shortId,
        redemption: "durable",
      },
    })
    playlistMap[shortId] = id
  }

  return { items, playlistMap }
}
