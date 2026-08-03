import type { MetadataBrowseAlbum, MetadataBrowseArtist, MetadataSourceUrl } from "@repo/types"
import type { CoverArtUrlFn, NavidromeAlbum, NavidromeArtist } from "./localTypes"

export type { CoverArtUrlFn } from "./localTypes"

/** Build browse `images` from a Subsonic coverArt id (URL only; no fetch). */
export function coverArtImages(
  coverArt: string | undefined,
  coverArtUrl?: CoverArtUrlFn,
): MetadataSourceUrl[] | undefined {
  const id = coverArt?.trim()
  if (!id || !coverArtUrl) return undefined
  return [{ type: "image", url: coverArtUrl(id), id }]
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
