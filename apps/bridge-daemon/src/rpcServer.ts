import type { BridgeRequest, BridgeResponse } from "@repo/adapter-bridge/protocol"
import type { LocalDriver } from "./drivers/local"
import { normalizeCoverVariants } from "./drivers/local"
import type { Router } from "./router"
import type { TtsService } from "./tts"

export class RpcServer {
  private unbind: (() => void) | null = null

  constructor(
    private readonly bindRequests: (handler: (req: BridgeRequest) => void) => () => void,
    private readonly sendResponse: (response: BridgeResponse) => void,
    private readonly router: Router,
    private readonly localDriver: LocalDriver | null,
    private readonly tts: TtsService | null = null,
  ) {}

  async start(): Promise<void> {
    this.unbind = this.bindRequests((req) => {
      void this.handleRequest(req)
    })
    console.log("[rpc] listening on device socket")
  }

  async stop(): Promise<void> {
    this.unbind?.()
    this.unbind = null
  }

  private async handleRequest(req: BridgeRequest) {
    try {
      const value = await this.dispatch(req)
      this.sendResponse({ id: req.id, ok: true, result: value ?? undefined })
    } catch (e) {
      this.sendResponse({
        id: req.id,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  private async dispatch(req: BridgeRequest): Promise<unknown> {
    const p = req.params
    switch (req.method) {
      case "playTrack":
        await this.router.playTrack({
          source: String(p.source),
          trackId: String(p.trackId),
          title: p.title != null ? String(p.title) : undefined,
          artist: p.artist != null ? String(p.artist) : undefined,
          album: p.album != null ? String(p.album) : undefined,
          volumePercent: typeof p.volumePercent === "number" ? p.volumePercent : undefined,
        })
        return null
      case "play":
        await this.router.play(p.source != null ? String(p.source) : undefined)
        return null
      case "pause":
        await this.router.pause(p.source != null ? String(p.source) : undefined)
        return null
      case "stop":
        await this.router.stop(p.source != null ? String(p.source) : undefined)
        return null
      case "seekTo":
        await this.router.seekTo(
          p.source != null ? String(p.source) : undefined,
          Number(p.positionMs ?? 0),
        )
        return null
      case "setVolume":
        await this.router.setVolume(
          p.source != null ? String(p.source) : undefined,
          Number(p.percent ?? 100),
        )
        return null
      case "getPlayback":
        return this.router.getPlayback(p.source != null ? String(p.source) : undefined)
      case "prepareSpotify":
        return this.router.prepareSpotify()
      case "search": {
        if (String(p.source) !== "local" || !this.localDriver) return []
        return this.localDriver.search(
          String(p.query ?? ""),
          parseIdList(p.playlistIds),
          parseIdList(p.albumIds),
        )
      }
      case "getTrack": {
        if (String(p.source) !== "local" || !this.localDriver) return null
        return this.localDriver.findById(
          String(p.trackId ?? p.id ?? ""),
          parseIdList(p.playlistIds),
          parseIdList(p.albumIds),
        )
      }
      case "listArtists": {
        if (String(p.source) !== "local" || !this.localDriver) return { items: [], total: 0 }
        return this.localDriver.listArtists({
          query: p.query != null ? String(p.query) : undefined,
          offset: p.offset != null ? Number(p.offset) : undefined,
          limit: p.limit != null ? Number(p.limit) : undefined,
          playlistIds: parseIdList(p.playlistIds),
          albumIds: parseIdList(p.albumIds),
        })
      }
      case "listAlbums": {
        if (String(p.source) !== "local" || !this.localDriver) return { items: [], total: 0 }
        return this.localDriver.listAlbums({
          query: p.query != null ? String(p.query) : undefined,
          offset: p.offset != null ? Number(p.offset) : undefined,
          limit: p.limit != null ? Number(p.limit) : undefined,
          playlistIds: parseIdList(p.playlistIds),
          albumIds: parseIdList(p.albumIds),
        })
      }
      case "getArtist": {
        if (String(p.source) !== "local" || !this.localDriver) return null
        return this.localDriver.getArtist(
          String(p.artistId ?? p.id ?? ""),
          parseIdList(p.playlistIds),
          parseIdList(p.albumIds),
        )
      }
      case "getAlbum": {
        if (String(p.source) !== "local" || !this.localDriver) return null
        return this.localDriver.getAlbum(
          String(p.albumId ?? p.id ?? ""),
          parseIdList(p.playlistIds),
          parseIdList(p.albumIds),
        )
      }
      case "checkPlaylistMembership": {
        if (String(p.source) !== "local" || !this.localDriver) {
          return { playlistIds: [], albumIds: [] }
        }
        const options = {
          firstMatch: p.firstMatch === true,
          includeTrackAlbumId: p.includeTrackAlbumId === true,
        }
        const trackIds = parseIdList(p.trackIds)
        if (trackIds && trackIds.length > 1) {
          return {
            byTrackId: await this.localDriver.checkPlaylistMembershipBatch(
              trackIds,
              parseIdList(p.playlistIds) ?? [],
              parseIdList(p.albumIds) ?? [],
              options,
            ),
          }
        }
        return this.localDriver.checkPlaylistMembership(
          String(p.trackId ?? trackIds?.[0] ?? ""),
          parseIdList(p.playlistIds) ?? [],
          parseIdList(p.albumIds) ?? [],
          options,
        )
      }
      case "listPlaylists": {
        if (String(p.source) !== "local" || !this.localDriver) return []
        return this.localDriver.listPlaylists()
      }
      case "listLibraryAlbums": {
        if (String(p.source) !== "local" || !this.localDriver) return []
        return this.localDriver.listLibraryAlbums()
      }
      case "listPlaylistTracks": {
        if (String(p.source) !== "local" || !this.localDriver) return []
        return this.localDriver.listPlaylistTracks(String(p.playlistId ?? p.id ?? ""))
      }
      case "listPlaylistTrackIds": {
        if (String(p.source) !== "local" || !this.localDriver) return []
        return this.localDriver.listPlaylistTrackIds(String(p.playlistId ?? p.id ?? ""))
      }
      case "listAlbumTrackIds": {
        if (String(p.source) !== "local" || !this.localDriver) return []
        return this.localDriver.listAlbumTrackIds(String(p.albumId ?? p.id ?? ""))
      }
      case "getPlaylistCoverArt": {
        if (String(p.source) !== "local" || !this.localDriver) return {}
        return this.localDriver.getPlaylistCoverArt(
          parseIdList(p.playlistIds) ?? [],
          normalizeCoverVariants(p.variants),
        )
      }
      case "getAlbumCoverArt": {
        if (String(p.source) !== "local" || !this.localDriver) return {}
        return this.localDriver.getAlbumCoverArt(
          parseIdList(p.albumIds) ?? [],
          normalizeCoverVariants(p.variants),
        )
      }
      case "getTrackPreview": {
        if (String(p.source) !== "local" || !this.localDriver) {
          throw new Error("Local metadata source is not available")
        }
        return this.localDriver.getTrackPreview(String(p.trackId ?? p.id ?? ""))
      }
      case "invalidatePlaylistCache": {
        if (!this.localDriver) return { ok: false }
        this.localDriver.invalidateLocalLibraryCache()
        return { ok: true }
      }
      case "notifyNowPlaying":
        await this.router.notifyNowPlaying({
          title: p.title != null ? String(p.title) : undefined,
          artist: p.artist != null ? String(p.artist) : undefined,
          album: p.album != null ? String(p.album) : undefined,
        })
        return null
      case "listSayVoices": {
        if (!this.tts) throw new Error("TTS is not available")
        return { voices: await this.tts.listVoices() }
      }
      case "speak": {
        if (!this.tts) throw new Error("TTS is not available")
        return await this.tts.speak({
          text: String(p.text ?? ""),
          voice: String(p.voice ?? ""),
        })
      }
      default:
        throw new Error(`Unknown method ${req.method}`)
    }
  }
}

function parseIdList(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const ids = raw.map((x) => String(x).trim()).filter(Boolean)
  return ids.length > 0 ? ids : undefined
}
