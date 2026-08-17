import type { MetadataBrowseAlbum, MetadataBrowseArtist } from "@repo/types"
import type { CoverArtUrlFn } from "./localTypes"
import { coverArtImages } from "./localBrowse"

export const PLAYLIST_CACHE_TTL_MS = 45_000

export type PlaylistMembership = {
  trackIds: Set<string>
  /** artistId → display title */
  artists: Map<string, string>
  /** albumId → { title, artistId, artistTitle, coverArt? } */
  albums: Map<
    string,
    { title: string; artistId: string; artistTitle: string; coverArt?: string }
  >
  fetchedAt: number
}

export type NavidromePlaylistEntry = {
  id?: string
  artist?: string
  artistId?: string
  album?: string
  albumId?: string
  coverArt?: string
}

/** Build membership sets from a Subsonic getPlaylist entry list (pure). */
export function membershipFromPlaylistEntries(
  entries: NavidromePlaylistEntry[],
  fetchedAt = Date.now(),
): PlaylistMembership {
  const trackIds = new Set<string>()
  const artists = new Map<string, string>()
  const albums = new Map<
    string,
    { title: string; artistId: string; artistTitle: string; coverArt?: string }
  >()

  for (const e of entries) {
    const trackId = e.id != null ? String(e.id) : ""
    if (trackId) trackIds.add(trackId)

    const artistId = e.artistId != null ? String(e.artistId) : ""
    const artistTitle = (e.artist ?? "").trim()
    if (artistId && !artists.has(artistId)) {
      artists.set(artistId, artistTitle || artistId)
    }

    const albumId = e.albumId != null ? String(e.albumId) : ""
    if (albumId && !albums.has(albumId)) {
      albums.set(albumId, {
        title: (e.album ?? "").trim() || albumId,
        artistId,
        artistTitle: artistTitle || artistId,
        coverArt: e.coverArt,
      })
    }
  }

  return { trackIds, artists, albums, fetchedAt }
}

/** Union several membership snapshots (shared daemon cache across playlist ids). */
export function unionMembership(parts: PlaylistMembership[]): PlaylistMembership {
  const trackIds = new Set<string>()
  const artists = new Map<string, string>()
  const albums = new Map<
    string,
    { title: string; artistId: string; artistTitle: string; coverArt?: string }
  >()
  let fetchedAt = 0
  for (const p of parts) {
    for (const id of p.trackIds) trackIds.add(id)
    for (const [id, title] of p.artists) {
      if (!artists.has(id)) artists.set(id, title)
    }
    for (const [id, album] of p.albums) {
      if (!albums.has(id)) albums.set(id, album)
    }
    fetchedAt = Math.max(fetchedAt, p.fetchedAt)
  }
  return { trackIds, artists, albums, fetchedAt }
}

export function artistsFromMembership(
  membership: PlaylistMembership,
  query?: string,
  coverArtUrl?: CoverArtUrlFn,
): MetadataBrowseArtist[] {
  let items: MetadataBrowseArtist[] = [...membership.artists.entries()].map(([id, title]) => ({
    id,
    title,
    images: undefined,
  }))
  // Prefer cover from any album by that artist when available
  if (coverArtUrl) {
    for (const album of membership.albums.values()) {
      if (!album.coverArt || !album.artistId) continue
      const idx = items.findIndex((a) => a.id === album.artistId)
      if (idx >= 0 && !items[idx]!.images?.length) {
        items[idx] = {
          ...items[idx]!,
          images: coverArtImages(album.coverArt, coverArtUrl),
        }
      }
    }
  }
  items.sort((x, y) => x.title.localeCompare(y.title, undefined, { sensitivity: "base" }))
  const q = query?.trim().toLowerCase()
  if (q) items = items.filter((a) => a.title.toLowerCase().includes(q))
  return items
}

export function albumsFromMembership(
  membership: PlaylistMembership,
  query?: string,
  coverArtUrl?: CoverArtUrlFn,
): MetadataBrowseAlbum[] {
  let items: MetadataBrowseAlbum[] = [...membership.albums.entries()].map(([id, a]) => ({
    id,
    title: a.title,
    artists: a.artistTitle
      ? [{ id: a.artistId, title: a.artistTitle, urls: [] }]
      : [],
    images: coverArtImages(a.coverArt, coverArtUrl),
  }))
  items.sort((x, y) => x.title.localeCompare(y.title, undefined, { sensitivity: "base" }))
  const q = query?.trim().toLowerCase()
  if (q) items = items.filter((a) => a.title.toLowerCase().includes(q))
  return items
}

/**
 * In-memory TTL cache of Navidrome playlist membership (daemon-wide).
 */
export class PlaylistMembershipCache {
  private readonly cache = new Map<string, PlaylistMembership>()

  constructor(
    private readonly fetchEntries: (playlistId: string) => Promise<NavidromePlaylistEntry[]>,
    private readonly ttlMs: number = PLAYLIST_CACHE_TTL_MS,
  ) {}

  invalidate(): void {
    this.cache.clear()
  }

  async get(playlistId: string): Promise<PlaylistMembership> {
    const id = playlistId.trim()
    if (!id) {
      return membershipFromPlaylistEntries([])
    }
    const existing = this.cache.get(id)
    if (existing && Date.now() - existing.fetchedAt < this.ttlMs) {
      return existing
    }
    const entries = await this.fetchEntries(id)
    const membership = membershipFromPlaylistEntries(entries)
    this.cache.set(id, membership)
    return membership
  }

  async getUnion(playlistIds: string[]): Promise<PlaylistMembership> {
    const unique = [...new Set(playlistIds.map((p) => p.trim()).filter(Boolean))]
    if (unique.length === 0) return membershipFromPlaylistEntries([])
    const parts = await Promise.all(unique.map((id) => this.get(id)))
    return unionMembership(parts)
  }

  /** Which of `playlistIds` contain `trackId` (uses cache). */
  async playlistsContainingTrack(trackId: string, playlistIds: string[]): Promise<string[]> {
    const tid = trackId.trim()
    if (!tid) return []
    const out: string[] = []
    for (const raw of playlistIds) {
      const id = raw.trim()
      if (!id) continue
      const m = await this.get(id)
      if (m.trackIds.has(tid)) out.push(id)
    }
    return out
  }
}
