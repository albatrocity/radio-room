import type { MetadataBrowseAlbum, MetadataBrowseArtist } from "@repo/types"
import type { CoverArtUrlFn } from "./localTypes"
import { coverArtImages } from "./localBrowse"
import { LruCache } from "./lruCache"
import { mapWithConcurrency } from "./localCoverCache"

/** Derived Physical Media playlists are session-stable product definitions. */
export const PLAYLIST_CACHE_TTL_MS = 10 * 60 * 1000
export const PLAYLIST_CACHE_MAX_ENTRIES = 256
/** Album shelves (Physical Media catalog / multi-grant) need a larger LRU than playlists. */
export const ALBUM_CACHE_MAX_ENTRIES = 1024
export const UNION_CACHE_MAX_ENTRIES = 64
/** Bound parallel getAlbum fetches when unioning a large albumId shelf. */
export const ALBUM_UNION_FETCH_CONCURRENCY = 8

export type PlaylistMembership = {
  trackIds: Set<string>
  /** artistId → display title */
  artists: Map<string, string>
  /** albumId → { title, artistId, artistTitle, coverArt? } */
  albums: Map<
    string,
    { title: string; artistId: string; artistTitle: string; coverArt?: string }
  >
  /** Full Subsonic getPlaylist / getAlbum entries. */
  entries: NavidromePlaylistEntry[]
  fetchedAt: number
}

export type NavidromePlaylistEntry = {
  id?: string
  title?: string
  artist?: string
  artistId?: string
  album?: string
  albumId?: string
  coverArt?: string
  duration?: number
  track?: number
  discNumber?: number
  path?: string
  comment?: string
  musicBrainzId?: string
}

export type AlbumMembershipMeta = {
  name?: string
  artist?: string
  artistId?: string
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

  return { trackIds, artists, albums, entries, fetchedAt }
}

/** Build membership from a Subsonic getAlbum song list (pure). */
export function membershipFromAlbumSongs(
  albumId: string,
  songs: NavidromePlaylistEntry[],
  albumMeta?: AlbumMembershipMeta,
  fetchedAt = Date.now(),
): PlaylistMembership {
  const annotated = songs.map((s) => ({
    ...s,
    albumId: s.albumId ?? albumId,
    album: s.album ?? albumMeta?.name,
    artist: s.artist ?? albumMeta?.artist,
    artistId: s.artistId ?? albumMeta?.artistId,
    coverArt: s.coverArt ?? albumMeta?.coverArt,
  }))
  const membership = membershipFromPlaylistEntries(annotated, fetchedAt)
  const id = albumId.trim()
  if (id && !membership.albums.has(id)) {
    const artistId = albumMeta?.artistId != null ? String(albumMeta.artistId) : ""
    const artistTitle = (albumMeta?.artist ?? "").trim()
    membership.albums.set(id, {
      title: (albumMeta?.name ?? "").trim() || id,
      artistId,
      artistTitle: artistTitle || artistId,
      coverArt: albumMeta?.coverArt,
    })
    if (artistId && !membership.artists.has(artistId)) {
      membership.artists.set(artistId, artistTitle || artistId)
    }
  } else if (id && albumMeta?.coverArt) {
    const existing = membership.albums.get(id)
    if (existing && !existing.coverArt) {
      membership.albums.set(id, { ...existing, coverArt: albumMeta.coverArt })
    }
  }
  return membership
}

/** Union several membership snapshots (shared daemon cache across playlist/album ids). */
export function unionMembership(parts: PlaylistMembership[]): PlaylistMembership {
  const trackIds = new Set<string>()
  const artists = new Map<string, string>()
  const albums = new Map<
    string,
    { title: string; artistId: string; artistTitle: string; coverArt?: string }
  >()
  const entries: NavidromePlaylistEntry[] = []
  let fetchedAt = 0
  for (const p of parts) {
    for (const id of p.trackIds) trackIds.add(id)
    for (const [id, title] of p.artists) {
      if (!artists.has(id)) artists.set(id, title)
    }
    for (const [id, album] of p.albums) {
      if (!albums.has(id)) albums.set(id, album)
    }
    entries.push(...p.entries)
    fetchedAt = Math.max(fetchedAt, p.fetchedAt)
  }
  return { trackIds, artists, albums, entries, fetchedAt }
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

/** CoverArt key for a membership artist (first album sleeve by that artist). */
export function artistCoverKeyFromMembership(
  membership: PlaylistMembership,
  artistId: string,
): string | undefined {
  for (const album of membership.albums.values()) {
    if (album.artistId === artistId && album.coverArt?.trim()) {
      return album.coverArt.trim()
    }
  }
  return undefined
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
 * In-memory TTL + LRU cache of Navidrome playlist membership (daemon-wide).
 */
export class PlaylistMembershipCache {
  private readonly cache: LruCache<PlaylistMembership>
  private readonly unionCache: LruCache<PlaylistMembership>

  constructor(
    private readonly fetchEntries: (playlistId: string) => Promise<NavidromePlaylistEntry[]>,
    private readonly ttlMs: number = PLAYLIST_CACHE_TTL_MS,
    maxEntries: number = PLAYLIST_CACHE_MAX_ENTRIES,
  ) {
    this.cache = new LruCache(maxEntries)
    this.unionCache = new LruCache(UNION_CACHE_MAX_ENTRIES)
  }

  invalidate(): void {
    this.cache.clear()
    this.unionCache.clear()
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
    const unique = [...new Set(playlistIds.map((p) => p.trim()).filter(Boolean))].sort()
    if (unique.length === 0) return membershipFromPlaylistEntries([])
    const parts = await Promise.all(unique.map((id) => this.get(id)))
    const maxFetched = parts.reduce((m, p) => Math.max(m, p.fetchedAt), 0)
    const unionKey = `${unique.join(",")}:${maxFetched}`
    const cachedUnion = this.unionCache.get(unionKey)
    if (cachedUnion) return cachedUnion
    const union = unionMembership(parts)
    this.unionCache.set(unionKey, union)
    return union
  }

  /**
   * Which of `playlistIds` contain `trackId` (uses cache). Fetches in parallel.
   * When `firstMatch` is true, still fetches in parallel but returns after the
   * first hit in input order (queue-time grant resolution only needs one).
   */
  async playlistsContainingTrack(
    trackId: string,
    playlistIds: string[],
    options?: { firstMatch?: boolean },
  ): Promise<string[]> {
    const tid = trackId.trim()
    if (!tid) return []
    const unique = [...new Set(playlistIds.map((p) => p.trim()).filter(Boolean))]
    if (unique.length === 0) return []
    const parts = await Promise.all(
      unique.map(async (id) => ({ id, membership: await this.get(id) })),
    )
    const out: string[] = []
    for (const { id, membership } of parts) {
      if (!membership.trackIds.has(tid)) continue
      out.push(id)
      if (options?.firstMatch) break
    }
    return out
  }
}

/**
 * In-memory TTL + LRU cache of Navidrome album membership (daemon-wide).
 * Populated from getAlbum.view song lists.
 */
export class AlbumMembershipCache {
  private readonly cache: LruCache<PlaylistMembership>
  private readonly unionCache: LruCache<PlaylistMembership>

  constructor(
    private readonly fetchAlbum: (albumId: string) => Promise<{
      songs: NavidromePlaylistEntry[]
      album?: AlbumMembershipMeta
    }>,
    private readonly ttlMs: number = PLAYLIST_CACHE_TTL_MS,
    maxEntries: number = ALBUM_CACHE_MAX_ENTRIES,
  ) {
    this.cache = new LruCache(maxEntries)
    this.unionCache = new LruCache(UNION_CACHE_MAX_ENTRIES)
  }

  invalidate(): void {
    this.cache.clear()
    this.unionCache.clear()
  }

  /** Fresh cached membership only — does not fetch. */
  peek(albumId: string): PlaylistMembership | undefined {
    const id = albumId.trim()
    if (!id) return undefined
    const existing = this.cache.get(id)
    if (existing && Date.now() - existing.fetchedAt < this.ttlMs) return existing
    return undefined
  }

  async get(albumId: string): Promise<PlaylistMembership> {
    const id = albumId.trim()
    if (!id) {
      return membershipFromPlaylistEntries([])
    }
    const existing = this.cache.get(id)
    if (existing && Date.now() - existing.fetchedAt < this.ttlMs) {
      return existing
    }
    const { songs, album } = await this.fetchAlbum(id)
    const membership = membershipFromAlbumSongs(id, songs, album)
    this.cache.set(id, membership)
    return membership
  }

  /**
   * Union membership for many album shelves. Fetches with bounded concurrency
   * so a large held-album grant set does not stampede Navidrome.
   */
  async getUnion(
    albumIds: string[],
    options?: { concurrency?: number },
  ): Promise<PlaylistMembership> {
    const unique = [...new Set(albumIds.map((p) => p.trim()).filter(Boolean))].sort()
    if (unique.length === 0) return membershipFromPlaylistEntries([])
    const concurrency = Math.max(1, options?.concurrency ?? ALBUM_UNION_FETCH_CONCURRENCY)
    const parts = await mapWithConcurrency(unique, concurrency, (id) => this.get(id))
    const maxFetched = parts.reduce((m, p) => Math.max(m, p.fetchedAt), 0)
    const unionKey = `${unique.join(",")}:${maxFetched}`
    const cachedUnion = this.unionCache.get(unionKey)
    if (cachedUnion) return cachedUnion
    const union = unionMembership(parts)
    this.unionCache.set(unionKey, union)
    return union
  }

  /**
   * @deprecated Prefer resolving the track's albumId (getSong) against the
   * allowlist — scanning every album membership is O(albums).
   */
  async albumsContainingTrack(
    trackId: string,
    albumIds: string[],
    options?: { firstMatch?: boolean },
  ): Promise<string[]> {
    const tid = trackId.trim()
    if (!tid) return []
    const unique = [...new Set(albumIds.map((p) => p.trim()).filter(Boolean))]
    if (unique.length === 0) return []
    const parts = await mapWithConcurrency(unique, ALBUM_UNION_FETCH_CONCURRENCY, async (id) => ({
      id,
      membership: await this.get(id),
    }))
    const out: string[] = []
    for (const { id, membership } of parts) {
      if (!membership.trackIds.has(tid)) continue
      out.push(id)
      if (options?.firstMatch) break
    }
    return out
  }
}
