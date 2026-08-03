import { createHash } from "node:crypto"
import { spawn, type ChildProcess, execFileSync } from "node:child_process"
import { createConnection, type Socket } from "node:net"
import { existsSync, mkdirSync, unlinkSync } from "node:fs"
import { join } from "node:path"
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
  MetadataSourceUrl,
} from "@repo/types"
import type { BridgeDaemonConfig } from "../config"
import { configDir } from "../config"
import type { Driver, DriverState } from "./Driver"
import {
  collectPublicUrlCandidates,
  pickPublicUrl,
  readPublicUrlCandidatesFromFile,
  resolveSongFilePath,
} from "./publicUrlTags"

function emptyAlbum(images: MetadataSourceTrack["images"] = []): MetadataSourceTrack["album"] {
  return {
    id: "",
    title: "",
    urls: [],
    artists: [],
    releaseDate: "",
    releaseDatePrecision: "year",
    totalTracks: 0,
    label: "",
    images,
  }
}

function md5(s: string) {
  return createHash("md5").update(s).digest("hex")
}

/** Basename without extension — used when tags have no title. */
export function titleFromFilename(path: string | undefined | null): string | undefined {
  if (!path?.trim()) return undefined
  const base = path.split(/[/\\]/).filter(Boolean).pop()
  if (!base) return undefined
  const withoutExt = base.replace(/\.[^./\\]+$/, "")
  const title = (withoutExt || base).trim()
  return title || undefined
}

function isPlaceholderTitle(title: string | undefined | null, trackId?: string): boolean {
  const t = (title ?? "").trim()
  if (!t) return true
  if (t.toLowerCase() === "unknown") return true
  if (trackId && t === trackId) return true
  return false
}

function isPlaceholderArtist(artist: string | undefined | null): boolean {
  const a = (artist ?? "").trim()
  if (!a) return true
  if (a.toLowerCase() === "unknown" || a.toLowerCase() === "local") return true
  return false
}

type NavidromeSong = {
  id?: string
  title?: string
  artist?: string
  artistId?: string
  album?: string
  albumId?: string
  path?: string
  duration?: number
  track?: number
  discNumber?: number
  coverArt?: string
  /** OpenSubsonic: comment tag (may be a lone URL). */
  comment?: string
  /** OpenSubsonic: MusicBrainz recording id. */
  musicBrainzId?: string
}

type NavidromeArtist = {
  id?: string
  name?: string
  albumCount?: number
  coverArt?: string
}

type NavidromeAlbum = {
  id?: string
  name?: string
  artist?: string
  artistId?: string
  year?: number
  songCount?: number
  coverArt?: string
}

export type CoverArtUrlFn = (coverArtId: string) => string

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

export function resolveLocalDisplayTitle(song: NavidromeSong): string {
  const id = song.id != null ? String(song.id) : undefined
  if (!isPlaceholderTitle(song.title, id)) return String(song.title).trim()
  return titleFromFilename(song.path) ?? (song.title?.trim() || id || "Unknown")
}

function resolveMpvPath(configured: string): string {
  if (configured.includes("/") && existsSync(configured)) return configured
  const candidates = [
    configured,
    "/opt/homebrew/bin/mpv",
    "/usr/local/bin/mpv",
  ]
  for (const c of candidates) {
    if (c.includes("/") && existsSync(c)) return c
  }
  try {
    const which = execFileSync("which", [configured === "mpv" ? "mpv" : configured], {
      encoding: "utf8",
    }).trim()
    if (which && existsSync(which)) return which
  } catch {
    /* ignore */
  }
  return configured
}

function waitForPath(path: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now()
  return new Promise((resolve) => {
    const tick = () => {
      if (existsSync(path)) {
        resolve(true)
        return
      }
      if (Date.now() - start >= timeoutMs) {
        resolve(false)
        return
      }
      setTimeout(tick, 100)
    }
    tick()
  })
}

export class LocalDriver implements Driver {
  readonly source = "local" as const
  private mpv: ChildProcess | null = null
  private socket: Socket | null = null
  private socketPath: string
  private endedCbs: Array<(trackId: string, reason?: string) => void> = []
  private stateCbs: Array<(state: DriverState) => void> = []
  private currentTrackId: string | null = null
  private state: DriverState = {
    state: "stopped",
    progressMs: null,
    durationMs: null,
    volumePercent: 100,
  }
  private reqId = 1
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  private pollTimer: NodeJS.Timeout | null = null
  /** Suppress end-file from loadfile replace / stop — only natural EOF should advance. */
  private ignoreEndFileUntil = 0
  private endedForTrackId: string | null = null

  constructor(
    private readonly navidrome: BridgeDaemonConfig["navidrome"],
    private readonly mpvConfig: BridgeDaemonConfig["mpv"],
  ) {
    this.socketPath = mpvConfig.socketPath ?? join(configDir(), "mpv.sock")
  }

  async start(): Promise<void> {
    const dir = configDir()
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    try {
      if (existsSync(this.socketPath)) unlinkSync(this.socketPath)
    } catch {
      /* ignore */
    }

    const mpvPath = resolveMpvPath(this.mpvConfig.path)

    let stderr = ""
    this.mpv = spawn(
      mpvPath,
      [
        `--input-ipc-server=${this.socketPath}`,
        "--idle=yes",
        // Never auto-advance to a next playlist entry (album siblings / autoload).
        // The Listening Room queue is the only source of the next track.
        "--keep-open=always",
        "--script-opts-append=autoload-disabled=yes",
        "--force-window=no",
        "--no-video",
        "--quiet",
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    )
    this.mpv.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8")
    })
    this.mpv.on("error", (err) => {
      console.error(`[local] failed to spawn mpv at ${mpvPath}:`, err.message)
    })
    this.mpv.on("exit", (code, signal) => {
      if (code != null && code !== 0) {
        console.error(`[local] mpv exited code=${code} signal=${signal} stderr=${stderr.trim()}`)
      }
      this.mpv = null
    })

    // Wait until the IPC socket file exists (mpv creates it after startup)
    const ready = await waitForPath(this.socketPath, 8000)
    if (!ready) {
      const hint =
        stderr.trim() ||
        (this.mpv?.killed === false && this.mpv?.exitCode == null
          ? "mpv still running but socket missing"
          : "mpv exited before creating the IPC socket")
      throw new Error(
        `mpv IPC socket not created at ${this.socketPath} (binary: ${mpvPath}). ${hint}. ` +
          `Set mpv.path to an absolute path (e.g. /opt/homebrew/bin/mpv) in config.json.`,
      )
    }

    await this.connectSocket()
    this.pollTimer = setInterval(() => void this.pollState(), 1000)
    console.log(`[local] mpv ready (${mpvPath})`)
  }

  private connectSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const tryConnect = (attempt: number) => {
        const sock = createConnection(this.socketPath)
        sock.on("connect", () => {
          this.socket = sock
          let buffer = ""
          sock.on("data", (chunk) => {
            buffer += chunk.toString("utf8")
            let idx
            while ((idx = buffer.indexOf("\n")) >= 0) {
              const line = buffer.slice(0, idx)
              buffer = buffer.slice(idx + 1)
              this.handleLine(line)
            }
          })
          sock.on("error", (err) => {
            console.warn("[local] mpv socket error:", err.message)
          })
          resolve()
        })
        sock.on("error", (err) => {
          sock.destroy()
          if (attempt < 30) {
            setTimeout(() => tryConnect(attempt + 1), 150)
          } else {
            reject(err)
          }
        })
      }
      tryConnect(0)
    })
  }

  private handleLine(line: string) {
    if (!line.trim()) return
    try {
      const msg = JSON.parse(line)
      if (msg.request_id != null && this.pending.has(msg.request_id)) {
        const p = this.pending.get(msg.request_id)!
        this.pending.delete(msg.request_id)
        // mpv uses error: "success" for OK replies (the field is always present)
        if (msg.error && msg.error !== "success") {
          p.reject(new Error(String(msg.error)))
        } else {
          p.resolve(msg.data)
        }
      }
      if (msg.event === "end-file") {
        this.handleEndFile(msg)
      }
    } catch {
      /* ignore */
    }
  }

  private handleEndFile(msg: { reason?: string }) {
    const id = this.currentTrackId
    this.state = { ...this.state, state: "stopped", progressMs: null }

    // loadfile replace / stop emit end-file with reason "stop" (or during our ignore window)
    if (Date.now() < this.ignoreEndFileUntil) return
    const reason = msg.reason ?? "unknown"
    if (reason !== "eof" && reason !== "error") return
    if (!id || this.endedForTrackId === id) return

    this.endedForTrackId = id
    for (const cb of this.endedCbs) cb(id, reason === "error" ? "error" : "natural")
  }

  private send(command: unknown[]): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error("mpv socket not connected"))
        return
      }
      const id = this.reqId++
      this.pending.set(id, { resolve, reject })
      this.socket.write(JSON.stringify({ command, request_id: id }) + "\n")
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error("mpv IPC timeout"))
        }
      }, 5000)
    })
  }

  private async pollState() {
    try {
      const paused = (await this.send(["get_property", "pause"])) as boolean
      const timePos = (await this.send(["get_property", "time-pos"]).catch(() => null)) as
        | number
        | null
      const duration = (await this.send(["get_property", "duration"]).catch(() => null)) as
        | number
        | null
      const volume = (await this.send(["get_property", "volume"]).catch(() => 100)) as number
      const idle = (await this.send(["get_property", "idle-active"]).catch(() => true)) as boolean

      this.state = {
        state: idle ? "stopped" : paused ? "paused" : "playing",
        progressMs: timePos != null ? Math.round(timePos * 1000) : null,
        durationMs: duration != null ? Math.round(duration * 1000) : null,
        volumePercent: volume,
        trackId: this.currentTrackId,
      }
      for (const cb of this.stateCbs) cb(this.state)
    } catch {
      /* ignore */
    }
  }

  async stop(): Promise<void> {
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = null
    this.ignoreEndFileUntil = Date.now() + 2000
    try {
      await this.send(["stop"])
    } catch {
      /* ignore */
    }
    this.socket?.destroy()
    this.socket = null
    this.mpv?.kill()
    this.mpv = null
  }

  async healthy(): Promise<boolean> {
    return !!this.socket && !this.socket.destroyed
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

  async findById(id: string): Promise<MetadataSourceTrack | null> {
    if (!this.navidrome.username || !id) return null
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

  async search(query: string): Promise<MetadataSourceTrack[]> {
    if (!this.navidrome.username) return []
    const url = `${this.navidrome.url}/rest/search3.view?query=${encodeURIComponent(query)}&songCount=20&${this.authParams()}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Navidrome search failed: ${res.status}`)
    const data = (await res.json()) as any
    const songs = data?.["subsonic-response"]?.searchResult3?.song ?? []
    const list: NavidromeSong[] = Array.isArray(songs) ? songs : songs ? [songs] : []

    const results: MetadataSourceTrack[] = []
    for (const song of list) {
      results.push(await this.mapSong(song))
    }
    return results
  }

  async listArtists(params?: MetadataListArtistsParams): Promise<MetadataListArtistsResult> {
    if (!this.navidrome.username) return { items: [], total: 0 }
    const url = `${this.navidrome.url}/rest/getArtists.view?${this.authParams()}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Navidrome getArtists failed: ${res.status}`)
    const data = (await res.json()) as any
    const indexes = data?.["subsonic-response"]?.artists?.index
    const coverArtUrl = this.coverArtUrlFn()
    let items = mapNavidromeArtists(
      Array.isArray(indexes) ? indexes : indexes ? [indexes] : [],
      params?.query,
      coverArtUrl,
    )
    const total = items.length
    const offset = Math.max(0, params?.offset ?? 0)
    const limit = params?.limit != null ? Math.max(0, params.limit) : undefined
    if (offset > 0 || limit != null) {
      items = items.slice(offset, limit != null ? offset + limit : undefined)
    }
    return { items, total }
  }

  async listAlbums(params?: MetadataListAlbumsParams): Promise<MetadataListAlbumsResult> {
    if (!this.navidrome.username) return { items: [], total: 0 }
    const query = params?.query?.trim()
    const offset = Math.max(0, params?.offset ?? 0)
    const limit = Math.min(Math.max(params?.limit ?? 50, 1), 50)
    const coverArtUrl = this.coverArtUrlFn()

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

  async getArtist(artistId: string): Promise<MetadataGetArtistResult | null> {
    if (!this.navidrome.username || !artistId) return null
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
    const albums = albumList
      .map((a) => mapNavidromeBrowseAlbum(a, coverArtUrl))
      .filter((a): a is MetadataBrowseAlbum => a != null)
    return {
      artist: {
        id: String(artist.id),
        title: String(artist.name ?? artist.id).trim() || String(artist.id),
        albumCount: typeof artist.albumCount === "number" ? artist.albumCount : albums.length,
        images: coverArtImages(artist.coverArt, coverArtUrl),
      },
      albums,
    }
  }

  async getAlbum(albumId: string): Promise<MetadataGetAlbumResult | null> {
    if (!this.navidrome.username || !albumId) return null
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
      tracks.push(await this.mapSong(song))
    }
    mappedAlbum.trackCount = tracks.length
    return { album: mappedAlbum, tracks }
  }

  async load(trackId: string): Promise<void> {
    if (!this.socket) await this.start()
    this.ignoreEndFileUntil = Date.now() + 2000
    this.endedForTrackId = null
    this.currentTrackId = trackId
    const url = this.streamUrl(trackId)
    console.log(
      `[local] loadfile trackId=${trackId} via ${this.navidrome.url} (mpv → system audio; Audio Hijack must capture mpv)`,
    )
    await this.send(["loadfile", url, "replace"])
    // Drop any auto-appended playlist entries (e.g. user autoload.lua) so only this track plays.
    await this.send(["playlist-clear"]).catch(() => undefined)
    await this.send(["set_property", "pause", false])
    // Surface immediate load failures (bad auth / missing file) instead of silent EOF later.
    try {
      const path = await this.send(["get_property", "path"])
      const duration = await this.send(["get_property", "duration"]).catch(() => null)
      console.log(`[local] playing path=${path} durationSec=${duration}`)
    } catch (err) {
      console.warn(`[local] load may have failed:`, err instanceof Error ? err.message : err)
    }
    this.state = { ...this.state, state: "playing", trackId }
  }

  async play(): Promise<void> {
    await this.send(["set_property", "pause", false])
  }

  async pause(): Promise<void> {
    await this.send(["set_property", "pause", true])
  }

  async seekTo(ms: number): Promise<void> {
    await this.send(["seek", ms / 1000, "absolute"])
  }

  async setVolume(percent: number): Promise<void> {
    await this.send(["set_property", "volume", percent])
  }

  async getState(): Promise<DriverState> {
    return { ...this.state, trackId: this.currentTrackId }
  }

  onEnded(cb: (trackId: string, reason?: string) => void): void {
    this.endedCbs.push(cb)
  }

  onStateChange(cb: (state: DriverState) => void): void {
    this.stateCbs.push(cb)
  }
}
