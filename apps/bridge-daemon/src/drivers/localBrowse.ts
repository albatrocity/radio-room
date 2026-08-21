import type { MetadataBrowseAlbum, MetadataBrowseArtist, MetadataSourceUrl } from "@repo/types"
import type { CoverArtUrlFn, NavidromeAlbum, NavidromeArtist } from "./localTypes"

export type { CoverArtUrlFn } from "./localTypes"

/** @deprecated Prefer {@link coverArtDataUriImages} — LAN Navidrome URLs are not browser-reachable. */
export function coverArtImages(
  coverArt: string | undefined,
  coverArtUrl?: CoverArtUrlFn,
): MetadataSourceUrl[] | undefined {
  const id = coverArt?.trim()
  if (!id || !coverArtUrl) return undefined
  return [{ type: "image", url: coverArtUrl(id), id }]
}

/** Browse list / header thumbs — small enough for EntityThumb, browser-reachable as data URIs. */
export const COVER_ART_BROWSE_SIZE = 128

/** Embed a cover as a data-URI image entry (listeners cannot reach Navidrome LAN URLs). */
export function coverArtDataUriImages(
  coverArt: string | undefined,
  dataUri: string | undefined,
): MetadataSourceUrl[] | undefined {
  const id = coverArt?.trim()
  if (!id || !dataUri?.trim()) return undefined
  return [{ type: "image", url: dataUri, id }]
}

/** Flatten Subsonic artist indexes into browse artists (pure; testable). */
export function mapNavidromeArtists(
  indexes: Array<{ artist?: NavidromeArtist | NavidromeArtist[] } | undefined> | undefined,
  query?: string,
  coverArtUrl?: CoverArtUrlFn,
): MetadataBrowseArtist[] {
  const raw = Array.isArray(indexes) ? indexes : []
  const artists: MetadataBrowseArtist[] = []
  for (const idx of raw) {
    const list = idx?.artist
    const arr = Array.isArray(list) ? list : list ? [list] : []
    for (const a of arr) {
      if (!a?.id) continue
      artists.push({
        id: String(a.id),
        title: String(a.name ?? a.id).trim() || String(a.id),
        albumCount: typeof a.albumCount === "number" ? a.albumCount : undefined,
        images: coverArtImages(a.coverArt, coverArtUrl),
      })
    }
  }
  artists.sort((x, y) => x.title.localeCompare(y.title, undefined, { sensitivity: "base" }))
  const q = query?.trim().toLowerCase()
  if (!q) return artists
  return artists.filter((a) => a.title.toLowerCase().includes(q))
}

/**
 * Flatten Subsonic artist indexes without embedding cover URLs.
 * Returns parallel coverArt keys for async data-URI hydration.
 */
export function mapNavidromeArtistsWithCoverKeys(
  indexes: Array<{ artist?: NavidromeArtist | NavidromeArtist[] } | undefined> | undefined,
  query?: string,
): { items: MetadataBrowseArtist[]; coverKeys: (string | undefined)[] } {
  const items = mapNavidromeArtists(indexes, query)
  const raw = Array.isArray(indexes) ? indexes : []
  const byId = new Map<string, string | undefined>()
  for (const idx of raw) {
    const list = idx?.artist
    const arr = Array.isArray(list) ? list : list ? [list] : []
    for (const a of arr) {
      if (!a?.id) continue
      byId.set(String(a.id), a.coverArt?.trim() || undefined)
    }
  }
  return {
    items,
    coverKeys: items.map((a) => byId.get(a.id)),
  }
}

/** Map Subsonic ID3 album stub to browse album (cover URL when coverArt present). */
export function mapNavidromeBrowseAlbum(
  album: NavidromeAlbum,
  coverArtUrl?: CoverArtUrlFn,
): MetadataBrowseAlbum | null {
  if (!album?.id) return null
  const artistTitle = album.artist?.trim() ?? ""
  return {
    id: String(album.id),
    title: String(album.name ?? album.id).trim() || String(album.id),
    artists: artistTitle
      ? [{ id: String(album.artistId ?? ""), title: artistTitle, urls: [] }]
      : [],
    year: album.year != null ? String(album.year) : undefined,
    trackCount: typeof album.songCount === "number" ? album.songCount : undefined,
    images: coverArtImages(album.coverArt, coverArtUrl),
  }
}

/** Normalize Subsonic album list / search3 album payload to browse albums. */
export function mapNavidromeAlbumList(
  albums: NavidromeAlbum | NavidromeAlbum[] | undefined,
  coverArtUrl?: CoverArtUrlFn,
): MetadataBrowseAlbum[] {
  const list = Array.isArray(albums) ? albums : albums ? [albums] : []
  return list
    .map((a) => mapNavidromeBrowseAlbum(a, coverArtUrl))
    .filter((a): a is MetadataBrowseAlbum => a != null)
}

/**
 * Map album list without LAN cover URLs; returns parallel coverArt keys for hydration.
 */
export function mapNavidromeAlbumListWithCoverKeys(
  albums: NavidromeAlbum | NavidromeAlbum[] | undefined,
): { items: MetadataBrowseAlbum[]; coverKeys: (string | undefined)[] } {
  const list = Array.isArray(albums) ? albums : albums ? [albums] : []
  const items: MetadataBrowseAlbum[] = []
  const coverKeys: (string | undefined)[] = []
  for (const a of list) {
    const mapped = mapNavidromeBrowseAlbum(a)
    if (!mapped) continue
    items.push(mapped)
    coverKeys.push(a.coverArt?.trim() || undefined)
  }
  return { items, coverKeys }
}
