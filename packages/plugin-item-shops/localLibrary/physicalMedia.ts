import type { ItemCatalogEntry } from "@repo/plugin-base/helpers"
import type { ArtworkFrame, ItemRarity, LucideIconName } from "@repo/types"
import type { PhysicalMediaOverride } from "./config"

const FORMAT_BY_TOKEN: Record<
  string,
  { format: string; icon: LucideIconName; artworkFrame: ArtworkFrame }
> = {
  CD: { format: "CD", icon: "Disc", artworkFrame: "jewel-case" },
  LP: { format: "LP", icon: "Disc3", artworkFrame: "record-jacket" },
  TAPE: { format: "Cassette", icon: "CassetteTape", artworkFrame: "cassette-case" },
  "45": { format: "45", icon: "DiscAlbum", artworkFrame: "die-cut-jacket" },
}

const RARITY_BY_TOKEN: Record<string, ItemRarity> = {
  COMMON: "common",
  UNCOMMON: "uncommon",
  RARE: "rare",
  LEGENDARY: "legendary",
}

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

/** Album-derived Physical Media shortId — distinct from playlist `pm-{id}`. */
export function physicalMediaAlbumShortId(albumId: string): string {
  const safe = albumId.trim().replace(/[^a-zA-Z0-9_-]/g, "-")
  return `pm-al-${safe}`
}

export type PhysicalMediaFormat = {
  format: string
  icon: LucideIconName
  artworkFrame: ArtworkFrame
}

/** Commercial CD era for album SKUs (ADR 0110 year bands; 0113 split). */
export const CD_ERA_START_YEAR = 1991

/** Share of CD-era non-singles that render as CDs; the rest are LPs (ADR 0113). */
export const CD_ERA_CD_PERCENT = 60

/** FNV-1a 32-bit; stable across refreshes so the same album keeps its format. */
function unsignedFnv1a32(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Deterministic CD vs LP roll for a CD-era album id (`< 60` → CD). */
export function cdEraDiscFormat(seed: string): "CD" | "LP" {
  return unsignedFnv1a32(seed) % 100 < CD_ERA_CD_PERCENT ? "CD" : "LP"
}

/**
 * Infer physical format from release year, track count, and a stable album seed.
 * Short releases (≤3 tracks) are 45s; then year bands: &lt;1983 LP, &lt;1991 cassette;
 * CD-era non-singles (1991+, or missing year) are 60% CD / 40% LP from `seed` (ADR 0113).
 * Without a seed, CD-era albums stay CD.
 */
export function inferPhysicalMediaFormat(
  year: number | undefined,
  songCount: number,
  seed?: string,
): PhysicalMediaFormat {
  if (songCount > 0 && songCount <= 3) {
    return FORMAT_BY_TOKEN["45"]
  }
  if (year != null && year < 1983) {
    return FORMAT_BY_TOKEN.LP
  }
  if (year != null && year < CD_ERA_START_YEAR) {
    return FORMAT_BY_TOKEN.TAPE
  }
  if (seed && cdEraDiscFormat(seed) === "LP") {
    return FORMAT_BY_TOKEN.LP
  }
  return FORMAT_BY_TOKEN.CD
}

export type PhysicalMediaAlbum = {
  id: string
  name: string
  artist?: string
  year?: number
  songCount?: number
  /** Navidrome userRating (1–5); drives rarity only (ADR 0111). */
  userRating?: number
}

/**
 * Album ids whose ordered track lists exactly match a derived playlist.
 * Fail toward keeping the album when either side is empty.
 */
export function albumIdsShadowedByPlaylists(
  playlists: readonly { trackIds: readonly string[] }[],
  albums: readonly { id: string; trackIds: readonly string[] }[],
): Set<string> {
  const shadowed = new Set<string>()
  const playlistSequences = playlists
    .map((p) => p.trackIds.map((id) => id.trim()).filter(Boolean))
    .filter((ids) => ids.length > 0)

  for (const album of albums) {
    const albumId = album.id.trim()
    if (!albumId) continue
    const albumTracks = album.trackIds.map((id) => id.trim()).filter(Boolean)
    if (albumTracks.length === 0) continue

    for (const playlistTracks of playlistSequences) {
      if (playlistTracks.length !== albumTracks.length) continue
      let match = true
      for (let i = 0; i < albumTracks.length; i++) {
        if (playlistTracks[i] !== albumTracks[i]) {
          match = false
          break
        }
      }
      if (match) {
        shadowed.add(albumId)
        break
      }
    }
  }
  return shadowed
}

export function derivePhysicalMediaItemsFromAlbums(
  albums: readonly PhysicalMediaAlbum[],
  /** Album cover art URLs keyed by Navidrome album id. */
  artworkByAlbumId: Readonly<Record<string, { imageUrl?: string; imageUrlLarge?: string }>> = {},
  /** Album ids to skip (playlist-over-album de-dup). */
  omitAlbumIds: ReadonlySet<string> = new Set(),
): { items: ItemCatalogEntry[]; albumMap: Record<string, string> } {
  const items: ItemCatalogEntry[] = []
  const albumMap: Record<string, string> = {}

  for (const album of albums) {
    const id = album.id.trim()
    if (!id || omitAlbumIds.has(id)) continue
    const shortId = physicalMediaAlbumShortId(id)
    const songCount = album.songCount ?? 0
    const inferred = inferPhysicalMediaFormat(album.year, songCount, id)
    const title = album.name.trim() || id
    const artist = album.artist?.trim()
    const name = `${inferred.format}: ${title}`
    const artwork = artworkByAlbumId[id]
    const imageUrl = artwork?.imageUrl?.trim()
    const imageUrlLarge = artwork?.imageUrlLarge?.trim()
    items.push({
      definition: {
        shortId,
        name,
        ...(artist ? { artist } : {}),
        description: `A ${inferred.format} from the Record Store. Queue any track on it for the rest of the session.`,
        icon: inferred.icon,
        artworkFrame: inferred.artworkFrame,
        ...(imageUrl ? { imageUrl } : {}),
        ...(imageUrlLarge ? { imageUrlLarge } : {}),
        stackable: true,
        maxStack: 5,
        tradeable: true,
        consumable: false,
        coinValue: priceFromSongCount(songCount),
        rarity: rarityFromUserRating(album.userRating),
        slotPool: "collection",
        detailView: {
          actionIcon: "Eye",
          actionLabel: "View",
          iconOnly: true,
          layout: "trackList",
        },
      },
      localLibraryGrant: {
        scope: "album",
        albumKey: shortId,
        redemption: "durable",
      },
    })
    albumMap[shortId] = id
  }

  return { items, albumMap }
}

/**
 * Split a playlist remainder or override (`Artist — Title`) so the artist can
 * render under the title. Album SKUs use Navidrome's artist field instead.
 */
export function splitPhysicalMediaArtistTitle(raw: string): {
  artist?: string
  title: string
} {
  const trimmed = raw.trim()
  if (!trimmed) return { title: trimmed }
  const match = /\s+[—–]\s+|\s+-\s+/.exec(trimmed)
  if (!match || match.index <= 0) return { title: trimmed }
  const artist = trimmed.slice(0, match.index).trim()
  const title = trimmed.slice(match.index + match[0].length).trim()
  if (!artist || !title) return { title: trimmed }
  return { artist, title }
}

export type ParsedPhysicalMediaName = {
  format: string
  title: string
  icon: LucideIconName
  artworkFrame: ArtworkFrame
  /** From optional `[RARE]`-style leading tags (ADR 0111). */
  rarity?: ItemRarity
}

/**
 * Parse leading consecutive recognized format/rarity brackets.
 * First unrecognized `[...]` ends the scan (e.g. `[LIVE][LP] Title` does not derive).
 * A format tag is required. Rarity tags are optional and stripped from the title.
 */
export function parsePhysicalMediaName(name: string): ParsedPhysicalMediaName | null {
  const trimmed = name.trim()
  if (!trimmed) return null

  let i = 0
  let formatInfo: (typeof FORMAT_BY_TOKEN)[string] | undefined
  let rarity: ItemRarity | undefined

  while (i < trimmed.length) {
    while (i < trimmed.length && /\s/.test(trimmed[i]!)) i++
    if (trimmed[i] !== "[") break
    const close = trimmed.indexOf("]", i + 1)
    if (close < 0) break
    const token = trimmed.slice(i + 1, close).trim().toUpperCase()
    const asFormat = FORMAT_BY_TOKEN[token]
    const asRarity = RARITY_BY_TOKEN[token]
    if (asFormat) {
      formatInfo = asFormat
      i = close + 1
      continue
    }
    if (asRarity) {
      rarity = asRarity
      i = close + 1
      continue
    }
    // Unrecognized bracket — stop; do not skip past it.
    break
  }

  if (!formatInfo) return null

  while (i < trimmed.length && /\s/.test(trimmed[i]!)) i++
  const title = trimmed.slice(i).trim() || trimmed
  return {
    format: formatInfo.format,
    icon: formatInfo.icon,
    artworkFrame: formatInfo.artworkFrame,
    title,
    ...(rarity ? { rarity } : {}),
  }
}

export function priceFromSongCount(songCount: number): number {
  if (songCount <= 4) return 8
  if (songCount <= 12) return 20
  if (songCount <= 20) return 35
  return 50
}

/** Coerce Subsonic JSON numbers that may arrive as strings. */
export function parseSubsonicNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value.trim())
    if (Number.isFinite(n)) return n
  }
  return undefined
}

/** Map Navidrome album `userRating` (1–5) to ItemRarity. Unset / invalid → common. */
export function rarityFromUserRating(userRating: unknown): ItemRarity {
  const parsed = parseSubsonicNumber(userRating)
  if (parsed == null) return "common"
  const stars = Math.round(parsed)
  if (stars <= 1) return "common"
  if (stars <= 3) return "uncommon"
  if (stars === 4) return "rare"
  if (stars >= 5) return "legendary"
  return "common"
}

export function derivePhysicalMediaItems(
  playlists: readonly PhysicalMediaPlaylist[],
  overrides: readonly PhysicalMediaOverride[] = [],
  /** Playlist cover art URLs keyed by Navidrome playlist id. */
  artworkByPlaylistId: Readonly<Record<string, { imageUrl?: string; imageUrlLarge?: string }>> = {},
  /**
   * Navidrome album `userRating` for playlists that shadow a catalog album
   * (ADR 0110 de-dup). Used when no override or title-tag rarity is set.
   */
  albumRatingByPlaylistId: Readonly<Record<string, number>> = {},
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
    const overrideName = override?.name?.trim()
    const { artist, title } = splitPhysicalMediaArtistTitle(overrideName || parsed.title)
    const name = overrideName ? (artist ? title : overrideName) : `${parsed.format}: ${title}`
    const comment = pl.comment?.trim()
    const artwork = override?.blankDisc ? undefined : artworkByPlaylistId[id]
    const imageUrl = artwork?.imageUrl?.trim()
    const imageUrlLarge = artwork?.imageUrlLarge?.trim()
    const rarity =
      override?.rarity ?? parsed.rarity ?? rarityFromUserRating(albumRatingByPlaylistId[id])
    items.push({
      definition: {
        shortId,
        name,
        ...(artist ? { artist } : {}),
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
        rarity,
        slotPool: "collection",
        detailView: {
          actionIcon: "Eye",
          actionLabel: "View",
          iconOnly: true,
          layout: "trackList",
        },
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
