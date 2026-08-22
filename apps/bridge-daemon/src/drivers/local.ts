import { createHash } from "node:crypto"
import type {
  MetadataBrowseAlbum,
  MetadataBrowseArtist,
  MetadataGetAlbumResult,
  MetadataGetArtistResult,
  MetadataListAlbumsParams,
  MetadataListAlbumsResult,
  MetadataListArtistsParams,
  MetadataListArtistsResult,
  MetadataSourceTrack,
} from "@repo/types"
import type { BridgeDaemonConfig } from "../config"
import type { Driver, DriverState } from "./Driver"
import {
  COVER_ART_BROWSE_SIZE,
  coverArtDataUriImages,
  mapNavidromeAlbumListWithCoverKeys,
  mapNavidromeArtistsWithCoverKeys,
  mapNavidromeBrowseAlbum,
} from "./localBrowse"
import { MpvPlayback } from "./localPlayback"
import {
  emptyAlbum,
  isPlaceholderArtist,
  isPlaceholderTitle,
  resolveLocalDisplayTitle,
} from "./localTags"
import type { NavidromeAlbum, NavidromeArtist, NavidromeSong } from "./localTypes"
import {
  AlbumMembershipCache,
  albumsFromMembership,
  artistCoverKeyFromMembership,
  artistsFromMembership,
  PlaylistMembershipCache,
  unionMembership,
  type PlaylistMembership,
} from "./localPlaylistCache"
import { CoverArtCache, coverCacheKey, mapWithConcurrency } from "./localCoverCache"
import {
  collectPublicUrlCandidates,
  pickPublicUrl,
  readPublicUrlCandidatesFromFile,
  resolveSongFilePath,
} from "./publicUrlTags"
import { assertFfmpegAvailable, encodeTrackPreviewClip } from "./trackPreviewClip"

const MAP_SONG_CONCURRENCY = 4
const COVER_ART_CONCURRENCY = 4
/** Long-edge px for per-track data-URI covers (`mapSong` / Now Playing fallback). */
export const COVER_ART_TRACK_SIZE = 640
export type CoverArtVariant = "sm" | "lg"
/** Playlist-sleeve sizes requested from Navidrome when the server asks for variants. */
export const COVER_ART_VARIANTS: Record<CoverArtVariant, number> = { sm: 384, lg: 1200 }
/** Flat `getPlaylistCoverArt` (no `variants` param) keeps the historical 640px size. */
export const COVER_ART_LEGACY_PLAYLIST_SIZE = 640

// Re-export pure helpers so existing tests keep importing from `./local`.
export {
  COVER_ART_BROWSE_SIZE,
  coverArtDataUriImages,
  coverArtImages,
  mapNavidromeAlbumList,
  mapNavidromeAlbumListWithCoverKeys,
  mapNavidromeArtists,
  mapNavidromeArtistsWithCoverKeys,
  mapNavidromeBrowseAlbum,
  type CoverArtUrlFn,
} from "./localBrowse"
export {
  resolveLocalDisplayTitle,
  titleFromFilename,
} from "./localTags"

function md5(s: string) {
  return createHash("md5").update(s).digest("hex")
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

function normalizeAlbumUserRating(value: unknown): number | undefined {
  const n = parseSubsonicNumber(value)
  if (n == null) return undefined
  if (n < 1 || n > 5) return undefined
  return Math.round(n)
}

function normalizeIdList(ids?: string[]): string[] {
  if (!ids?.length) return []
  return Array.from(new Set(ids.map((p) => p.trim()).filter(Boolean)))
}

/** @deprecated Prefer {@link normalizeIdList}. */
function normalizePlaylistIds(playlistIds?: string[]): string[] {
  return normalizeIdList(playlistIds)
}

export type LocalCatalogFilter = {
  playlistIds?: string[]
  albumIds?: string[]
}

export type LibraryAlbumListItem = {
  id: string
  name: string
  artist?: string
  year?: number
  songCount?: number
  /** Subsonic coverArt key only — never a data URI. */
  coverArt?: string
  /** Navidrome userRating (1–5) when present; drives Physical Media rarity (ADR 0111). */
  userRating?: number
}

const LIBRARY_ALBUM_PAGE_SIZE = 500

export function normalizeCoverVariants(raw: unknown): CoverArtVariant[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined
  const out: CoverArtVariant[] = []
  for (const value of raw) {
    if ((value === "sm" || value === "lg") && !out.includes(value)) out.push(value)
  }
  return out.length > 0 ? out : undefined
}

export class LocalDriver implements Driver {
  readonly source = "local" as const
  private readonly playback: MpvPlayback
  private readonly playlistCache: PlaylistMembershipCache
  private readonly albumCache: AlbumMembershipCache
  private readonly coverCache: CoverArtCache
  /** coverArt keys discovered via listLibraryAlbums (albumId → coverArt). */
  private readonly albumCoverKeys = new Map<string, string>()

  constructor(
    private readonly navidrome: BridgeDaemonConfig["navidrome"],
    mpvConfig: BridgeDaemonConfig["mpv"],
  ) {
    this.playback = new MpvPlayback(mpvConfig)
    this.playlistCache = new PlaylistMembershipCache((playlistId) =>
      this.fetchPlaylistEntries(playlistId),
    )
    this.albumCache = new AlbumMembershipCache((albumId) => this.fetchAlbumMembership(albumId))
    this.coverCache = new CoverArtCache((coverKey, sizePx) => this.fetchCoverDataUri(coverKey, sizePx))
  }

  async start(): Promise<void> {
    await this.playback.start()
  }

  async stop(): Promise<void> {
    this.invalidateLocalLibraryCache()
    await this.playback.stop()
  }

  /** Drop playlist/album membership and cover-art caches (admin refresh / reconnect). */
  invalidateLocalLibraryCache(): void {
    this.playlistCache.invalidate()
    this.albumCache.invalidate()
    this.albumCoverKeys.clear()
    this.coverCache.invalidate()
  }

  async healthy(): Promise<boolean> {
    return this.playback.healthy()
  }

  private authParams(): string {
    const { username, password } = this.navidrome
    const salt = Math.random().toString(36).slice(2)
    const token = md5(password + salt)
    return `u=${encodeURIComponent(username)}&t=${token}&s=${salt}&v=1.16.1&c=bridge&f=json`
  }

  /**
   * Fetch cover bytes into a data-URI `images` entry. CatalogBrowse runs in
   * listeners' browsers; Navidrome LAN URLs are unreachable off the DJ Mac.
   */
  private async resolveBrowseCoverImages(
    coverArt: string | undefined,
  ): Promise<import("@repo/types").MetadataSourceUrl[] | undefined> {
    const key = coverArt?.trim()
    if (!key) return undefined
    const dataUri = await this.coverCache.get(key, COVER_ART_BROWSE_SIZE)
    return coverArtDataUriImages(key, dataUri)
  }

  private async withBrowseCoverDataUris<T extends { images?: import("@repo/types").MetadataSourceUrl[] }>(
    items: T[],
    coverKeys: (string | undefined)[],
  ): Promise<T[]> {
    const pairs = items.map((item, i) => ({ item, coverKey: coverKeys[i] }))
    return mapWithConcurrency(pairs, COVER_ART_CONCURRENCY, async ({ item, coverKey }) => ({
      ...item,
      images: await this.resolveBrowseCoverImages(coverKey),
    }))
  }

  streamUrl(id: string): string {
    return `${this.navidrome.url}/rest/stream.view?id=${encodeURIComponent(id)}&${this.authParams()}`
  }

  private async fetchPlaylistEntries(playlistId: string) {
    if (!this.navidrome.username || !playlistId) return []
    const url = `${this.navidrome.url}/rest/getPlaylist.view?id=${encodeURIComponent(playlistId)}&${this.authParams()}`
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`[LocalDriver] getPlaylist ${playlistId} failed: ${res.status}`)
      return []
    }
    const data = (await res.json()) as any
    const entry = data?.["subsonic-response"]?.playlist?.entry
    return Array.isArray(entry) ? entry : entry ? [entry] : []
  }

  private async fetchAlbumMembership(albumId: string) {
    if (!this.navidrome.username || !albumId) return { songs: [] }
    const url = `${this.navidrome.url}/rest/getAlbum.view?id=${encodeURIComponent(albumId)}&${this.authParams()}`
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`[LocalDriver] getAlbum ${albumId} failed: ${res.status}`)
      return { songs: [] }
    }
    const data = (await res.json()) as any
    const album = data?.["subsonic-response"]?.album as
      | (NavidromeAlbum & { song?: NavidromeSong | NavidromeSong[] })
      | undefined
    if (!album?.id) return { songs: [] }
    const songRaw = album.song
    const songs = Array.isArray(songRaw) ? songRaw : songRaw ? [songRaw] : []
    const coverArt = album.coverArt?.trim()
    if (coverArt) this.albumCoverKeys.set(String(album.id), coverArt)
    return {
      songs,
      album: {
        name: album.name,
        artist: album.artist,
        artistId: album.artistId,
        coverArt: album.coverArt,
      },
    }
  }

  /**
   * Restricted catalog membership when either playlistIds or albumIds is non-empty.
   * Both empty → null (full library).
   */
  private async membershipFor(filter?: LocalCatalogFilter): Promise<PlaylistMembership | null> {
    const playlistIds = normalizeIdList(filter?.playlistIds)
    const albumIds = normalizeIdList(filter?.albumIds)
    if (playlistIds.length === 0 && albumIds.length === 0) return null
    const parts: PlaylistMembership[] = []
    if (playlistIds.length > 0) parts.push(await this.playlistCache.getUnion(playlistIds))
    if (albumIds.length > 0) parts.push(await this.albumCache.getUnion(albumIds))
    return parts.length === 1 ? parts[0]! : unionMembership(parts)
  }

  /** Album-id shelf with no playlists — filter by song.albumId instead of getUnion. */
  private isAlbumOnlyShelf(playlistIds?: string[], albumIds?: string[]): boolean {
    return normalizeIdList(playlistIds).length === 0 && normalizeIdList(albumIds).length > 0
  }

  private albumIdAllowSet(albumIds?: string[]): Set<string> {
    return new Set(normalizeIdList(albumIds))
  }

  async listPlaylistTracks(playlistId: string): Promise<MetadataSourceTrack[]> {
    if (!this.navidrome.username || !playlistId.trim()) return []
    const membership = await this.playlistCache.get(playlistId)
    return mapWithConcurrency(membership.entries, MAP_SONG_CONCURRENCY, (song) =>
      this.mapSong(song),
    )
  }

  /**
   * Ordered track id (+ optional albumId) rows for a playlist — no mapSong / cover
   * fetches. Used for Physical Media playlist-over-album de-dup.
   */
  async listPlaylistTrackIds(
    playlistId: string,
  ): Promise<Array<{ id: string; albumId?: string }>> {
    if (!this.navidrome.username || !playlistId.trim()) return []
    const membership = await this.playlistCache.get(playlistId)
    const out: Array<{ id: string; albumId?: string }> = []
    for (const entry of membership.entries) {
      const id = entry.id != null ? String(entry.id).trim() : ""
      if (!id) continue
      const albumId = entry.albumId != null ? String(entry.albumId).trim() : ""
      out.push(albumId ? { id, albumId } : { id })
    }
    return out
  }

  /**
   * Ordered track ids for an album from membership cache — no mapSong.
   */
  async listAlbumTrackIds(albumId: string): Promise<string[]> {
    if (!this.navidrome.username || !albumId.trim()) return []
    const membership = await this.albumCache.get(albumId)
    const out: string[] = []
    for (const entry of membership.entries) {
      const id = entry.id != null ? String(entry.id).trim() : ""
      if (id) out.push(id)
    }
    return out
  }

  async playlistsContainingTrack(
    trackId: string,
    playlistIds: string[],
    options?: { firstMatch?: boolean },
  ): Promise<string[]> {
    return this.playlistCache.playlistsContainingTrack(trackId, playlistIds, options)
  }

  /**
   * Navidrome album id for a track (one getSong). A song belongs to at most one
   * album — prefer this over scanning album membership caches.
   */
  async fetchSongAlbumId(trackId: string): Promise<string | undefined> {
    const id = trackId.trim()
    if (!this.navidrome.username || !id) return undefined
    const url = `${this.navidrome.url}/rest/getSong.view?id=${encodeURIComponent(id)}&${this.authParams()}`
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`[LocalDriver] getSong ${id} failed: ${res.status}`)
      return undefined
    }
    const data = (await res.json()) as any
    const song = data?.["subsonic-response"]?.song as NavidromeSong | undefined
    const albumId = song?.albumId != null ? String(song.albumId).trim() : ""
    return albumId || undefined
  }

  /**
   * Which of `albumIds` is this track's album. O(1) getSong — never fetches
   * every album in the filter (Physical Media catalog mode can be thousands).
   */
  async albumsContainingTrack(
    trackId: string,
    albumIds: string[],
    _options?: { firstMatch?: boolean },
  ): Promise<string[]> {
    const unique = [...new Set(albumIds.map((a) => a.trim()).filter(Boolean))]
    if (unique.length === 0) return []
    const albumId = await this.fetchSongAlbumId(trackId)
    if (!albumId) return []
    return unique.includes(albumId) ? [albumId] : []
  }

  /**
   * Which of the given playlists / albums contain `trackId`.
   * Always returns the object shape so album shelf grants fail closed on old
   * adapters that ignore albumIds (and vice versa).
   *
   * When `includeTrackAlbumId` is true, the track's Navidrome album id is
   * included in `albumIds` (callers filter against their derived SKU map).
   * That avoids shipping thousands of album ids on Now Playing / queue augment.
   */
  async checkPlaylistMembership(
    trackId: string,
    playlistIds: string[],
    albumIds: string[] = [],
    options?: { firstMatch?: boolean; includeTrackAlbumId?: boolean },
  ): Promise<{ playlistIds: string[]; albumIds: string[] }> {
    const albumFilter = [...new Set(albumIds.map((a) => a.trim()).filter(Boolean))]
    const wantTrackAlbum = options?.includeTrackAlbumId === true
    const needSongAlbum = wantTrackAlbum || albumFilter.length > 0

    const [matchedPlaylists, trackAlbumId] = await Promise.all([
      this.playlistsContainingTrack(trackId, playlistIds, options),
      needSongAlbum ? this.fetchSongAlbumId(trackId) : Promise.resolve(undefined),
    ])

    const albumOut: string[] = []
    if (trackAlbumId && albumFilter.includes(trackAlbumId)) {
      albumOut.push(trackAlbumId)
    }
    if (wantTrackAlbum && trackAlbumId && !albumOut.includes(trackAlbumId)) {
      albumOut.push(trackAlbumId)
    }
    return { playlistIds: matchedPlaylists, albumIds: albumOut }
  }

  /**
   * List Navidrome playlists (admin shelf picker / Physical Media derivation).
   * Returns id + name (+ songCount / comment when present).
   */
  async listPlaylists(): Promise<
    Array<{ id: string; name: string; songCount?: number; comment?: string }>
  > {
    if (!this.navidrome.username) return []
    const url = `${this.navidrome.url}/rest/getPlaylists.view?${this.authParams()}`
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`[LocalDriver] getPlaylists failed: ${res.status}`)
      return []
    }
    const data = (await res.json()) as any
    const raw = data?.["subsonic-response"]?.playlists?.playlist
    const list = Array.isArray(raw) ? raw : raw ? [raw] : []
    const out: Array<{ id: string; name: string; songCount?: number; comment?: string }> = []
    for (const p of list) {
      const id = p?.id != null ? String(p.id) : ""
      if (!id) continue
      const comment = typeof p.comment === "string" ? p.comment.trim() : ""
      out.push({
        id,
        name: String(p.name ?? id).trim() || id,
        ...(typeof p.songCount === "number" ? { songCount: p.songCount } : {}),
        ...(comment ? { comment } : {}),
      })
    }
    out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    return out
  }

  /**
   * Cover art (data URIs) for the given playlists, keyed by playlist id. Navidrome
   * exposes playlist art under a `pl-<id>` cover key; playlists without art are
   * omitted from the result.
   *
   * When `variants` is omitted, returns today's flat `Record<id, dataUri>` at 640px
   * so an old adapter talking to a new daemon still works. When `variants` is set,
   * returns `Record<id, { sm?, lg? }>`.
   */
  async getPlaylistCoverArt(
    playlistIds: string[],
    variants?: CoverArtVariant[],
  ): Promise<Record<string, string> | Record<string, { sm?: string; lg?: string }>> {
    if (!this.navidrome.username) return {}
    const ids = normalizePlaylistIds(playlistIds)
    if (ids.length === 0) return {}
    const requested = normalizeCoverVariants(variants)
    if (!requested) {
      const out: Record<string, string> = {}
      await mapWithConcurrency(ids, COVER_ART_CONCURRENCY, async (id) => {
        const dataUri = await this.coverCache.get(`pl-${id}`, COVER_ART_LEGACY_PLAYLIST_SIZE)
        if (dataUri) out[id] = dataUri
      })
      return out
    }
    const out: Record<string, { sm?: string; lg?: string }> = {}
    await mapWithConcurrency(ids, COVER_ART_CONCURRENCY, async (id) => {
      const bag: { sm?: string; lg?: string } = {}
      for (const variant of requested) {
        const dataUri = await this.coverCache.get(`pl-${id}`, COVER_ART_VARIANTS[variant])
        if (dataUri) bag[variant] = dataUri
      }
      if (bag.sm || bag.lg) out[id] = bag
    })
    return out
  }

  /**
   * Full Navidrome album catalog for Physical Media album-shelf SKU derivation.
   * Pages getAlbumList2 alphabeticalByName; returns coverArt keys only (no data URIs).
   */
  async listLibraryAlbums(): Promise<LibraryAlbumListItem[]> {
    if (!this.navidrome.username) return []
    const out: LibraryAlbumListItem[] = []
    let offset = 0
    for (;;) {
      const url =
        `${this.navidrome.url}/rest/getAlbumList2.view?type=alphabeticalByName` +
        `&size=${LIBRARY_ALBUM_PAGE_SIZE}&offset=${offset}&${this.authParams()}`
      const res = await fetch(url)
      if (!res.ok) {
        console.warn(`[LocalDriver] getAlbumList2 failed: ${res.status}`)
        break
      }
      const data = (await res.json()) as any
      const raw = data?.["subsonic-response"]?.albumList2?.album
      const list: NavidromeAlbum[] = Array.isArray(raw) ? raw : raw ? [raw] : []
      if (list.length === 0) break
      for (const a of list) {
        const id = a?.id != null ? String(a.id) : ""
        if (!id) continue
        const coverArt = a.coverArt?.trim() || undefined
        if (coverArt) this.albumCoverKeys.set(id, coverArt)
        const userRating = normalizeAlbumUserRating(a.userRating)
        const year = parseSubsonicNumber(a.year)
        const songCount = parseSubsonicNumber(a.songCount)
        out.push({
          id,
          name: String(a.name ?? id).trim() || id,
          ...(a.artist != null && String(a.artist).trim()
            ? { artist: String(a.artist).trim() }
            : {}),
          ...(year != null ? { year } : {}),
          ...(songCount != null ? { songCount } : {}),
          ...(coverArt ? { coverArt } : {}),
          ...(userRating != null ? { userRating } : {}),
        })
      }
      if (list.length < LIBRARY_ALBUM_PAGE_SIZE) break
      offset += LIBRARY_ALBUM_PAGE_SIZE
    }
    return out
  }

  private albumCoverKey(albumId: string): string {
    const id = albumId.trim()
    const fromList = this.albumCoverKeys.get(id)?.trim()
    if (fromList) return fromList
    const peeked = this.albumCache.peek(id)?.albums.get(id)?.coverArt?.trim()
    if (peeked) return peeked
    // Navidrome accepts album ids as getCoverArt ids.
    return id
  }

  /**
   * Cover art (data URIs) for the given albums, keyed by album id.
   * Cover key = prior list/cache `coverArt` or the album id (no `pl-` prefix).
   */
  async getAlbumCoverArt(
    albumIds: string[],
    variants?: CoverArtVariant[],
  ): Promise<Record<string, string> | Record<string, { sm?: string; lg?: string }>> {
    if (!this.navidrome.username) return {}
    const ids = normalizeIdList(albumIds)
    if (ids.length === 0) return {}
    const requested = normalizeCoverVariants(variants)
    if (!requested) {
      const out: Record<string, string> = {}
      await mapWithConcurrency(ids, COVER_ART_CONCURRENCY, async (id) => {
        const dataUri = await this.coverCache.get(
          this.albumCoverKey(id),
          COVER_ART_LEGACY_PLAYLIST_SIZE,
        )
        if (dataUri) out[id] = dataUri
      })
      return out
    }
    const out: Record<string, { sm?: string; lg?: string }> = {}
    await mapWithConcurrency(ids, COVER_ART_CONCURRENCY, async (id) => {
      const coverKey = this.albumCoverKey(id)
      const bag: { sm?: string; lg?: string } = {}
      for (const variant of requested) {
        const dataUri = await this.coverCache.get(coverKey, COVER_ART_VARIANTS[variant])
        if (dataUri) bag[variant] = dataUri
      }
      if (bag.sm || bag.lg) out[id] = bag
    })
    return out
  }

  private async fetchCoverDataUri(coverKey: string, sizePx: number): Promise<string | undefined> {
    try {
      const coverUrl = `${this.navidrome.url}/rest/getCoverArt.view?id=${encodeURIComponent(coverKey)}&size=${sizePx}&${this.authParams()}`
      const coverRes = await fetch(coverUrl)
      if (!coverRes.ok) return undefined
      const buf = Buffer.from(await coverRes.arrayBuffer())
      const ct = coverRes.headers.get("content-type") ?? "image/jpeg"
      return `data:${ct};base64,${buf.toString("base64")}`
    } catch {
      return undefined
    }
  }

  private async resolvePublicUrl(song: NavidromeSong): Promise<string | undefined> {
    const filePath = resolveSongFilePath(this.navidrome.musicFolder, song.path)
    const fromFile = filePath ? await readPublicUrlCandidatesFromFile(filePath) : {}
    // API comment/mbid fill gaps; file tags win for the same token.
    const candidates = {
      ...collectPublicUrlCandidates({
        comment: song.comment,
        musicBrainzId: song.musicBrainzId,
      }),
      ...fromFile,
    }
    return pickPublicUrl(candidates, this.navidrome.publicUrlTagPriority)
  }

  private async mapSong(song: NavidromeSong): Promise<MetadataSourceTrack> {
    const id = String(song.id ?? "")
    const coverKey = coverCacheKey(song)
    const coverDataUri = coverKey ? await this.coverCache.get(coverKey, COVER_ART_TRACK_SIZE) : undefined
    const images = coverDataUri
      ? [{ type: "image" as const, url: coverDataUri, id }]
      : []
    const artistTitle = isPlaceholderArtist(song.artist) ? "" : String(song.artist).trim()
    const publicUrl = await this.resolvePublicUrl(song)

    return {
      id,
      title: resolveLocalDisplayTitle(song),
      urls: [
        { type: "resource", url: `local:${id}`, id },
        ...(publicUrl ? [{ type: "resource" as const, url: publicUrl, id: "external" }] : []),
      ],
      artists: artistTitle
        ? [{ id: String(song.artistId ?? ""), title: artistTitle, urls: [] }]
        : [],
      album: {
        ...emptyAlbum(images),
        id: String(song.albumId ?? ""),
        title: song.album ?? "",
      },
      duration: (song.duration ?? 0) * 1000,
      explicit: false,
      trackNumber: song.track ?? 0,
      discNumber: song.discNumber ?? 0,
      popularity: 0,
      images,
    }
  }

  /**
   * Encode a ~15s mid-track MP3 preview (ADR 0103).
   * Prefers the file on disk via musicFolder + song path; falls back to authenticated
   * stream.view (same URL mpv uses) when the path cannot be resolved.
   */
  async getTrackPreview(
    trackId: string,
  ): Promise<{ mimeType: "audio/mpeg"; data: string; durationMs: number }> {
    await assertFfmpegAvailable()
    const id = trackId.trim()
    if (!this.navidrome.username || !id) {
      throw new Error("Track id is required")
    }
    const url = `${this.navidrome.url}/rest/getSong.view?id=${encodeURIComponent(id)}&${this.authParams()}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Navidrome getSong failed: ${res.status}`)
    const data = (await res.json()) as any
    const song = data?.["subsonic-response"]?.song as NavidromeSong | undefined
    if (!song?.id) throw new Error("Track not found")
    const diskPath = resolveSongFilePath(this.navidrome.musicFolder, song.path)
    const input = diskPath ?? this.streamUrl(id)
    if (!diskPath) {
      console.warn(
        `[local] preview ${id}: using stream.view (song.path=${song.path ?? "?"}, musicFolder=${this.navidrome.musicFolder ? "set" : "unset"})`,
      )
    }
    const durationSec = song.duration ?? 0
    return encodeTrackPreviewClip({
      trackId: id,
      input,
      durationSec: durationSec > 0 ? durationSec : 15,
    })
  }

  async findById(
    id: string,
    playlistIds?: string[],
    albumIds?: string[],
  ): Promise<MetadataSourceTrack | null> {
    if (!this.navidrome.username || !id) return null

    // Album-only shelf: one getSong + albumId ∈ allowlist (no getAlbum × N union).
    if (this.isAlbumOnlyShelf(playlistIds, albumIds)) {
      const allow = this.albumIdAllowSet(albumIds)
      const url = `${this.navidrome.url}/rest/getSong.view?id=${encodeURIComponent(id)}&${this.authParams()}`
      const res = await fetch(url)
      if (!res.ok) return null
      const data = (await res.json()) as any
      const song = data?.["subsonic-response"]?.song as NavidromeSong | undefined
      if (!song?.id) return null
      const songAlbum = song.albumId != null ? String(song.albumId).trim() : ""
      if (!songAlbum || !allow.has(songAlbum)) return null
      return this.mapSong(song)
    }

    const membership = await this.membershipFor({ playlistIds, albumIds })
    if (membership && !membership.trackIds.has(id)) return null
    const url = `${this.navidrome.url}/rest/getSong.view?id=${encodeURIComponent(id)}&${this.authParams()}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = (await res.json()) as any
    const song = data?.["subsonic-response"]?.song as NavidromeSong | undefined
    if (!song?.id) return null
    return this.mapSong(song)
  }

  /**
   * Fill gaps for Now Playing / playTrack when the platform sent id stubs
   * (title=id, artist=Local) or empty tags.
   */
  async resolvePlayMeta(
    trackId: string,
    incoming?: { title?: string; artist?: string; album?: string },
  ): Promise<{ title: string; artist: string; album: string }> {
    const track = await this.findById(trackId)
    const title = !isPlaceholderTitle(incoming?.title, trackId)
      ? String(incoming!.title).trim()
      : track?.title || trackId
    const artist = !isPlaceholderArtist(incoming?.artist)
      ? String(incoming!.artist).trim()
      : track?.artists?.[0]?.title ?? ""
    const album = (incoming?.album ?? "").trim() || track?.album?.title || ""
    return { title, artist, album }
  }

  async search(
    query: string,
    playlistIds?: string[],
    albumIds?: string[],
  ): Promise<MetadataSourceTrack[]> {
    if (!this.navidrome.username) return []
    const url = `${this.navidrome.url}/rest/search3.view?query=${encodeURIComponent(query)}&songCount=20&${this.authParams()}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Navidrome search failed: ${res.status}`)
    const data = (await res.json()) as any
    const songs = data?.["subsonic-response"]?.searchResult3?.song ?? []
    const list: NavidromeSong[] = Array.isArray(songs) ? songs : songs ? [songs] : []

    let filtered: NavidromeSong[]
    if (this.isAlbumOnlyShelf(playlistIds, albumIds)) {
      const allow = this.albumIdAllowSet(albumIds)
      filtered = list.filter((song) => {
        const albumId = song.albumId != null ? String(song.albumId).trim() : ""
        return Boolean(albumId && allow.has(albumId))
      })
    } else {
      const membership = await this.membershipFor({ playlistIds, albumIds })
      filtered = list.filter((song) => {
        const id = String(song.id ?? "")
        return !membership || membership.trackIds.has(id)
      })
    }
    return mapWithConcurrency(filtered, MAP_SONG_CONCURRENCY, (song) => this.mapSong(song))
  }

  async listArtists(
    params?: MetadataListArtistsParams,
  ): Promise<MetadataListArtistsResult> {
    if (!this.navidrome.username) return { items: [], total: 0 }
    const membership = await this.membershipFor({
      playlistIds: params?.playlistIds,
      albumIds: params?.albumIds,
    })
    let items: MetadataBrowseArtist[]
    let coverKeys: (string | undefined)[]
    if (membership) {
      items = artistsFromMembership(membership, params?.query)
      coverKeys = items.map((a) => artistCoverKeyFromMembership(membership, a.id))
    } else {
      const url = `${this.navidrome.url}/rest/getArtists.view?${this.authParams()}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Navidrome getArtists failed: ${res.status}`)
      const data = (await res.json()) as any
      const indexes = data?.["subsonic-response"]?.artists?.index
      const mapped = mapNavidromeArtistsWithCoverKeys(
        Array.isArray(indexes) ? indexes : indexes ? [indexes] : [],
        params?.query,
      )
      items = mapped.items
      coverKeys = mapped.coverKeys
    }
    const total = items.length
    const offset = Math.max(0, params?.offset ?? 0)
    const limit = params?.limit != null ? Math.max(0, params.limit) : undefined
    if (offset > 0 || limit != null) {
      const end = limit != null ? offset + limit : undefined
      items = items.slice(offset, end)
      coverKeys = coverKeys.slice(offset, end)
    }
    items = await this.withBrowseCoverDataUris(items, coverKeys)
    return { items, total }
  }

  async listAlbums(
    params?: MetadataListAlbumsParams,
  ): Promise<MetadataListAlbumsResult> {
    if (!this.navidrome.username) return { items: [], total: 0 }
    const membership = await this.membershipFor({
      playlistIds: params?.playlistIds,
      albumIds: params?.albumIds,
    })
    const query = params?.query?.trim()
    const offset = Math.max(0, params?.offset ?? 0)
    const limit = Math.min(Math.max(params?.limit ?? 50, 1), 50)

    if (membership) {
      let items = albumsFromMembership(membership, query)
      const total = items.length
      items = items.slice(offset, offset + limit)
      const coverKeys = items.map((a) => membership.albums.get(a.id)?.coverArt?.trim() || undefined)
      items = await this.withBrowseCoverDataUris(items, coverKeys)
      return { items, total }
    }

    if (query) {
      const url =
        `${this.navidrome.url}/rest/search3.view?query=${encodeURIComponent(query)}` +
        `&artistCount=0&albumCount=${limit}&songCount=0&${this.authParams()}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Navidrome search3 albums failed: ${res.status}`)
      const data = (await res.json()) as any
      const albums = data?.["subsonic-response"]?.searchResult3?.album
      const { items: rawItems, coverKeys } = mapNavidromeAlbumListWithCoverKeys(albums)
      const items = await this.withBrowseCoverDataUris(rawItems, coverKeys)
      return { items, total: items.length }
    }

    const url =
      `${this.navidrome.url}/rest/getAlbumList2.view?type=alphabeticalByName` +
      `&size=${limit}&offset=${offset}&${this.authParams()}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Navidrome getAlbumList2 failed: ${res.status}`)
    const data = (await res.json()) as any
    const albums = data?.["subsonic-response"]?.albumList2?.album
    const { items: rawItems, coverKeys } = mapNavidromeAlbumListWithCoverKeys(albums)
    const items = await this.withBrowseCoverDataUris(rawItems, coverKeys)
    return { items, total: items.length }
  }

  async getArtist(
    artistId: string,
    playlistIds?: string[],
    albumIds?: string[],
  ): Promise<MetadataGetArtistResult | null> {
    if (!this.navidrome.username || !artistId) return null
    const membership = await this.membershipFor({ playlistIds, albumIds })
    if (membership && !membership.artists.has(artistId)) return null

    const url = `${this.navidrome.url}/rest/getArtist.view?id=${encodeURIComponent(artistId)}&${this.authParams()}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = (await res.json()) as any
    const artist = data?.["subsonic-response"]?.artist as
      | (NavidromeArtist & { album?: NavidromeAlbum | NavidromeAlbum[] })
      | undefined
    if (!artist?.id) return null
    const albumRaw = artist.album
    const albumList = Array.isArray(albumRaw) ? albumRaw : albumRaw ? [albumRaw] : []
    let { items: albums, coverKeys: albumCoverKeys } = mapNavidromeAlbumListWithCoverKeys(albumList)
    if (membership) {
      const filtered: MetadataBrowseAlbum[] = []
      const filteredKeys: (string | undefined)[] = []
      for (let i = 0; i < albums.length; i++) {
        if (!membership.albums.has(albums[i]!.id)) continue
        filtered.push(albums[i]!)
        filteredKeys.push(albumCoverKeys[i])
      }
      albums = filtered
      albumCoverKeys = filteredKeys
    }
    albums = await this.withBrowseCoverDataUris(albums, albumCoverKeys)
    const artistCoverKey =
      artist.coverArt?.trim() ||
      (membership ? artistCoverKeyFromMembership(membership, artistId) : undefined) ||
      albumCoverKeys[0]
    return {
      artist: {
        id: String(artist.id),
        title: String(artist.name ?? artist.id).trim() || String(artist.id),
        albumCount: membership
          ? albums.length
          : typeof artist.albumCount === "number"
            ? artist.albumCount
            : albums.length,
        images: await this.resolveBrowseCoverImages(artistCoverKey),
      },
      albums,
    }
  }

  async getAlbum(
    albumId: string,
    playlistIds?: string[],
    albumIds?: string[],
  ): Promise<MetadataGetAlbumResult | null> {
    if (!this.navidrome.username || !albumId) return null

    let membership: PlaylistMembership | null = null
    if (this.isAlbumOnlyShelf(playlistIds, albumIds)) {
      if (!this.albumIdAllowSet(albumIds).has(albumId.trim())) return null
    } else {
      membership = await this.membershipFor({ playlistIds, albumIds })
      if (membership && !membership.albums.has(albumId)) return null
    }

    const url = `${this.navidrome.url}/rest/getAlbum.view?id=${encodeURIComponent(albumId)}&${this.authParams()}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = (await res.json()) as any
    const album = data?.["subsonic-response"]?.album as
      | (NavidromeAlbum & { song?: NavidromeSong | NavidromeSong[] })
      | undefined
    if (!album?.id) return null
    const mappedAlbum = mapNavidromeBrowseAlbum(album)
    if (!mappedAlbum) return null
    mappedAlbum.images = await this.resolveBrowseCoverImages(album.coverArt)
    const songRaw = album.song
    const songs = Array.isArray(songRaw) ? songRaw : songRaw ? [songRaw] : []
    const filtered = songs.filter((song) => {
      const id = String(song.id ?? "")
      return !membership || membership.trackIds.has(id)
    })
    const tracks = await mapWithConcurrency(filtered, MAP_SONG_CONCURRENCY, (song) =>
      this.mapSong(song),
    )
    mappedAlbum.trackCount = tracks.length
    return { album: mappedAlbum, tracks }
  }

  async load(trackId: string): Promise<void> {
    await this.playback.load(trackId, this.streamUrl(trackId), this.navidrome.url)
  }

  async play(): Promise<void> {
    await this.playback.play()
  }

  async pause(): Promise<void> {
    await this.playback.pause()
  }

  async seekTo(ms: number): Promise<void> {
    await this.playback.seekTo(ms)
  }

  async setVolume(percent: number): Promise<void> {
    await this.playback.setVolume(percent)
  }

  async getState(): Promise<DriverState> {
    return this.playback.getState()
  }

  onEnded(cb: (trackId: string, reason?: string) => void): void {
    this.playback.onEnded(cb)
  }

  onStateChange(cb: (state: DriverState) => void): void {
    this.playback.onStateChange(cb)
  }
}
