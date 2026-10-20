import type { ItemCatalogEntry } from "@repo/plugin-base/helpers"
import type {
  LibraryAlbumRow,
  PhysicalMediaFormat,
  PhysicalMediaPick,
  RecordAlbumRef,
} from "@repo/types"
import { cannedPhysicalMediaDescription } from "./conditionMessaging"
import {
  RECORD_DETAIL_VIEW,
  inferPhysicalMediaFormat,
  physicalMediaFormatInfo,
  priceFromSongCount,
} from "./physicalMedia"

/**
 * Designer-picked records (ADR 0216). A pick is a snapshot of one album on a
 * metadata source; it becomes a record SKU once it resolves to an album this
 * room can play.
 */

/** A pick and the album it resolved to in this room. Persisted per room. */
export type ResolvedPick = { pick: PhysicalMediaPick; ref: RecordAlbumRef }

/** Identity of a pick as authored (source, id, chosen format). */
export function pickKey(pick: Pick<PhysicalMediaPick, "source" | "id" | "format">): string {
  return `${pick.source}:${pick.id.trim()}:${pick.format ?? ""}`
}

const EDITION_WORDS =
  /\b(remaster(ed)?|deluxe|edition|expanded|anniversary|bonus|mono|stereo|reissue|version)\b/

/**
 * Comparable album/artist text: lowercase, no diacritics, no leading "The",
 * no edition suffixes like "(2009 Remaster)", letters and digits only.
 */
export function normalizeAlbumText(value: string): string {
  let text = value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
  text = text.replace(/[([][^)\]]*[)\]]/g, (group) => (EDITION_WORDS.test(group) ? " " : group))
  text = text.replace(/\s+-\s+[^-]*$/, (tail) => (EDITION_WORDS.test(tail) ? " " : tail))
  text = text.replace(/&/g, " and ")
  text = text.replace(/^\s*the\s+/, "")
  return text.replace(/[^\p{L}\p{N}]+/gu, "")
}

/**
 * The room album a pick names. Spotify ids are global; a local pick tries its
 * authoring id first, then artist + title (Navidrome ids belong to one server),
 * preferring a matching year.
 */
export function resolvePick(
  pick: PhysicalMediaPick,
  libraryAlbums: readonly LibraryAlbumRow[],
): RecordAlbumRef | null {
  const id = pick.id.trim()
  if (!id) return null
  if (pick.source !== "local") return { sourceId: pick.source, albumId: id }

  if (libraryAlbums.some((album) => album.id.trim() === id)) {
    return { sourceId: "local", albumId: id }
  }
  const title = normalizeAlbumText(pick.title)
  const artist = normalizeAlbumText(pick.artist)
  if (!title) return null
  const matches = libraryAlbums.filter(
    (album) =>
      normalizeAlbumText(album.name) === title &&
      (!artist || normalizeAlbumText(album.artist ?? "") === artist),
  )
  const best = matches.find((album) => pick.year != null && album.year === pick.year) ?? matches[0]
  return best ? { sourceId: "local", albumId: best.id.trim() } : null
}

/** The pick's format override, else the same inference library albums use. */
export function pickedRecordFormat(
  pick: PhysicalMediaPick,
  ref: RecordAlbumRef,
): PhysicalMediaFormat {
  return pick.format ?? inferPhysicalMediaFormat(pick.year, pick.trackCount, ref.albumId).token
}

/** `pm-{source}-{format}-{albumId}`; an LP and a CD of one album are distinct. */
export function pickedRecordShortId(ref: RecordAlbumRef, format: PhysicalMediaFormat): string {
  const safe = (value: string) => value.trim().replace(/[^a-zA-Z0-9_-]/g, "-")
  return `pm-${safe(ref.sourceId)}-${format.toLowerCase()}-${safe(ref.albumId)}`
}

/**
 * A record SKU for a resolved pick. Local picks carry the album-scope library
 * grant, so restricted Local access, membership, and wear work as for any
 * library record. Other sources carry `recordAlbum`.
 */
export function derivePickedRecord({ pick, ref }: ResolvedPick): ItemCatalogEntry {
  const format = physicalMediaFormatInfo(pickedRecordFormat(pick, ref))
  const shortId = pickedRecordShortId(ref, format.token)
  const imageUrl = pick.imageUrl?.trim()
  const lore = pick.lore?.trim()
  return {
    definition: {
      shortId,
      name: `${format.format}: ${pick.title.trim()}`,
      artist: pick.artist.trim(),
      description: cannedPhysicalMediaDescription(format.format),
      icon: format.icon,
      artworkFrame: format.artworkFrame,
      mediaFormat: format.token,
      mediaAlbum: ref,
      ...(imageUrl ? { imageUrl } : {}),
      ...(lore ? { lore } : {}),
      stackable: false,
      maxStack: 1,
      tradeable: true,
      consumable: false,
      coinValue: priceFromSongCount(pick.trackCount),
      rarity: "common",
      slotPool: "collection",
      detailView: { ...RECORD_DETAIL_VIEW },
    },
    ...(ref.sourceId === "local"
      ? { localLibraryGrant: { scope: "album", albumKey: shortId, redemption: "durable" } }
      : { recordAlbum: ref }),
  }
}
