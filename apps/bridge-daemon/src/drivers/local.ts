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
  coverArtImages,
  mapNavidromeAlbumList,
  mapNavidromeArtists,
  mapNavidromeBrowseAlbum,
  type CoverArtUrlFn,
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
  albumsFromMembership,
  artistsFromMembership,
  PlaylistMembershipCache,
  type PlaylistMembership,
} from "./localPlaylistCache"
import {
  collectPublicUrlCandidates,
  pickPublicUrl,
  readPublicUrlCandidatesFromFile,
  resolveSongFilePath,
} from "./publicUrlTags"

// Re-export pure helpers so existing tests keep importing from `./local`.
export {
  coverArtImages,
  mapNavidromeAlbumList,
  mapNavidromeArtists,
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

function normalizePlaylistIds(playlistIds?: string[]): string[] {
  if (!playlistIds?.length) return []
  return [...new Set(playlistIds.map((p) => p.trim()).filter(Boolean))]
}

export class LocalDriver implements Driver {
  readonly source = "local" as const
  private readonly playback: MpvPlayback
  private readonly playlistCache: PlaylistMembershipCache

  constructor(
    private readonly navidrome: BridgeDaemonConfig["navidrome"],
    mpvConfig: BridgeDaemonConfig["mpv"],
  ) {
    this.playback = new MpvPlayback(mpvConfig)
    this.playlistCache = new PlaylistMembershipCache((playlistId) =>
      this.fetchPlaylistEntries(playlistId),
    )
  }

  async start(): Promise<void> {
    await this.playback.start()
  }

  async stop(): Promise<void> {
    await this.playback.stop()
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

  /** Stable cover URL builder for one browse response (shared auth salt). */
  private coverArtUrlFn(): CoverArtUrlFn {
    const auth = this.authParams()
    const base = this.navidrome.url
    return (coverArtId: string) =>
      `${base}/rest/getCoverArt.view?id=${encodeURIComponent(coverArtId)}&size=128&${auth}`
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

  private async membershipFor(playlistIds?: string[]): Promise<PlaylistMembership | null> {
    const ids = normalizePlaylistIds(playlistIds)
    if (ids.length === 0) return null
    return this.playlistCache.getUnion(ids)
  }

  async playlistsContainingTrack(trackId: string, playlistIds: string[]): Promise<string[]> {
    return this.playlistCache.playlistsContainingTrack(trackId, playlistIds)
  }

  private async fetchCoverDataUri(songId: string): Promise<string | undefined> {
    try {
      const coverUrl = `${this.navidrome.url}/rest/getCoverArt.view?id=${encodeURIComponent(songId)}&size=256&${this.authParams()}`
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
    const coverDataUri = id ? await this.fetchCoverDataUri(id) : undefined
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

  async findById(id: string, playlistIds?: string[]): Promise<MetadataSourceTrack | null> {
    if (!this.navidrome.username || !id) return null
    const membership = await this.membershipFor(playlistIds)
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

  async search(query: string, playlistIds?: string[]): Promise<MetadataSourceTrack[]> {
    if (!this.navidrome.username) return []
    const membership = await this.membershipFor(playlistIds)
    const url = `${this.navidrome.url}/rest/search3.view?query=${encodeURIComponent(query)}&songCount=20&${this.authParams()}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Navidrome search failed: ${res.status}`)
    const data = (await res.json()) as any
    const songs = data?.["subsonic-response"]?.searchResult3?.song ?? []
    const list: NavidromeSong[] = Array.isArray(songs) ? songs : songs ? [songs] : []

    const results: MetadataSourceTrack[] = []
    for (const song of list) {
      const id = String(song.id ?? "")
      if (membership && !membership.trackIds.has(id)) continue
      results.push(await this.mapSong(song))
    }
    return results
  }

  async listArtists(
    params?: MetadataListArtistsParams & { playlistIds?: string[] },
  ): Promise<MetadataListArtistsResult> {
    if (!this.navidrome.username) return { items: [], total: 0 }
    const membership = await this.membershipFor(params?.playlistIds)
    const coverArtUrl = this.coverArtUrlFn()
    let items: MetadataBrowseArtist[]
    if (membership) {
      items = artistsFromMembership(membership, params?.query, coverArtUrl)
    } else {
      const url = `${this.navidrome.url}/rest/getArtists.view?${this.authParams()}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Navidrome getArtists failed: ${res.status}`)
      const data = (await res.json()) as any
      const indexes = data?.["subsonic-response"]?.artists?.index
      items = mapNavidromeArtists(
        Array.isArray(indexes) ? indexes : indexes ? [indexes] : [],
        params?.query,
        coverArtUrl,
      )
    }
    const total = items.length
    const offset = Math.max(0, params?.offset ?? 0)
    const limit = params?.limit != null ? Math.max(0, params.limit) : undefined
    if (offset > 0 || limit != null) {
      items = items.slice(offset, limit != null ? offset + limit : undefined)
    }
    return { items, total }
  }

  async listAlbums(
    params?: MetadataListAlbumsParams & { playlistIds?: string[] },
  ): Promise<MetadataListAlbumsResult> {
    if (!this.navidrome.username) return { items: [], total: 0 }
    const membership = await this.membershipFor(params?.playlistIds)
    const query = params?.query?.trim()
    const offset = Math.max(0, params?.offset ?? 0)
    const limit = Math.min(Math.max(params?.limit ?? 50, 1), 50)
    const coverArtUrl = this.coverArtUrlFn()

    if (membership) {
      let items = albumsFromMembership(membership, query, coverArtUrl)
      const total = items.length
      items = items.slice(offset, offset + limit)
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
      const items = mapNavidromeAlbumList(albums, coverArtUrl)
      return { items, total: items.length }
    }

    const url =
      `${this.navidrome.url}/rest/getAlbumList2.view?type=alphabeticalByName` +
      `&size=${limit}&offset=${offset}&${this.authParams()}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Navidrome getAlbumList2 failed: ${res.status}`)
    const data = (await res.json()) as any
    const albums = data?.["subsonic-response"]?.albumList2?.album
    const items = mapNavidromeAlbumList(albums, coverArtUrl)
    return { items, total: items.length }
  }

  async getArtist(
    artistId: string,
    playlistIds?: string[],
  ): Promise<MetadataGetArtistResult | null> {
    if (!this.navidrome.username || !artistId) return null
    const membership = await this.membershipFor(playlistIds)
    if (membership && !membership.artists.has(artistId)) return null

    const url = `${this.navidrome.url}/rest/getArtist.view?id=${encodeURIComponent(artistId)}&${this.authParams()}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = (await res.json()) as any
    const artist = data?.["subsonic-response"]?.artist as
      | (NavidromeArtist & { album?: NavidromeAlbum | NavidromeAlbum[] })
      | undefined
    if (!artist?.id) return null
    const coverArtUrl = this.coverArtUrlFn()
    const albumRaw = artist.album
    const albumList = Array.isArray(albumRaw) ? albumRaw : albumRaw ? [albumRaw] : []
    let albums = albumList
      .map((a) => mapNavidromeBrowseAlbum(a, coverArtUrl))
      .filter((a): a is MetadataBrowseAlbum => a != null)
    if (membership) {
      albums = albums.filter((a) => membership.albums.has(a.id))
    }
    return {
      artist: {
        id: String(artist.id),
        title: String(artist.name ?? artist.id).trim() || String(artist.id),
        albumCount: membership
          ? albums.length
          : typeof artist.albumCount === "number"
            ? artist.albumCount
            : albums.length,
        images: coverArtImages(artist.coverArt, coverArtUrl),
      },
      albums,
    }
  }

  async getAlbum(albumId: string, playlistIds?: string[]): Promise<MetadataGetAlbumResult | null> {
    if (!this.navidrome.username || !albumId) return null
    const membership = await this.membershipFor(playlistIds)
    if (membership && !membership.albums.has(albumId)) return null

    const url = `${this.navidrome.url}/rest/getAlbum.view?id=${encodeURIComponent(albumId)}&${this.authParams()}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = (await res.json()) as any
    const album = data?.["subsonic-response"]?.album as
      | (NavidromeAlbum & { song?: NavidromeSong | NavidromeSong[] })
      | undefined
    if (!album?.id) return null
    const mappedAlbum = mapNavidromeBrowseAlbum(album, this.coverArtUrlFn())
    if (!mappedAlbum) return null
    const songRaw = album.song
    const songs = Array.isArray(songRaw) ? songRaw : songRaw ? [songRaw] : []
    const tracks: MetadataSourceTrack[] = []
    for (const song of songs) {
      const id = String(song.id ?? "")
      if (membership && !membership.trackIds.has(id)) continue
      tracks.push(await this.mapSong(song))
    }
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
