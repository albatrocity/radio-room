import type { Driver, DriverState } from "./drivers/Driver"
import { LocalDriver } from "./drivers/local"
import type { NowPlayingPublisher } from "./nowPlaying"
import type { Presence } from "./presence"
import type { SpotifyDeviceHost } from "./spotifyDevice"

const STOPPED: DriverState = {
  state: "stopped",
  progressMs: null,
  durationMs: null,
  trackId: null,
}

export class Router {
  private active: Driver | null = null
  private meta = new Map<string, { title?: string; artist?: string; album?: string }>()

  constructor(
    private readonly drivers: Map<string, Driver>,
    private readonly presence: Presence,
    private readonly nowPlaying: NowPlayingPublisher,
    private readonly roomId: string,
    private readonly spotifyDevice: SpotifyDeviceHost | null = null,
  ) {
    for (const driver of Array.from(drivers.values())) {
      driver.onEnded((trackId: string, reason?: string) => {
        void this.presence.publish({
          type: "ENDED",
          source: driver.source,
          trackId,
          reason,
        })
      })
      driver.onStateChange((state: DriverState) => {
        void this.presence.publish({
          type: "STATE",
          source: driver.source,
          state: state.state,
          progressMs: state.progressMs,
          durationMs: state.durationMs,
          volumePercent: state.volumePercent ?? null,
        })
      })
    }
  }

  getDriver(source: string): Driver | undefined {
    return this.drivers.get(source)
  }

  async playTrack(params: {
    source: string
    trackId: string
    title?: string
    artist?: string
    album?: string
    volumePercent?: number
  }): Promise<void> {
    const driver = this.drivers.get(params.source)
    if (!driver) throw new Error(`No driver for source ${params.source}`)

    if (this.active && this.active !== driver) {
      await this.active.pause().catch(() => {})
    }

    let title = params.title
    let artist = params.artist
    let album = params.album
    if (driver instanceof LocalDriver) {
      const resolved = await driver.resolvePlayMeta(params.trackId, {
        title,
        artist,
        album,
      })
      title = resolved.title
      artist = resolved.artist
      album = resolved.album
    }

    this.meta.set(params.trackId, { title, artist, album })

    await driver.load(params.trackId, { title, artist, album })
    if (params.volumePercent != null) {
      await driver.setVolume(params.volumePercent)
    }
    await driver.play()
    this.active = driver

    await this.nowPlaying.publish(this.roomId, {
      title,
      artist,
      album,
      mediaSource: { type: params.source, trackId: params.trackId },
    })
  }

  async pause(source?: string): Promise<void> {
    const d = source ? this.drivers.get(source) : this.active
    await d?.pause()
  }

  async play(source?: string): Promise<void> {
    const d = source ? this.drivers.get(source) : this.active
    await d?.play()
  }

  async stop(source?: string): Promise<void> {
    const d = source ? this.drivers.get(source) : this.active
    if (!d) return
    if (d.source === "youtube" && "stopPlayback" in d) {
      await (d as import("./drivers/youtube").YoutubeDriver).stopPlayback()
    } else {
      await d.pause()
    }
    if (this.active === d) this.active = null
  }

  async seekTo(source: string | undefined, positionMs: number): Promise<void> {
    const d = source ? this.drivers.get(source) : this.active
    await d?.seekTo(positionMs)
  }

  async setVolume(source: string | undefined, percent: number): Promise<void> {
    const d = source ? this.drivers.get(source) : this.active
    await d?.setVolume(percent)
  }

  async getPlayback(source?: string): Promise<DriverState> {
    if (source === "spotify") {
      if (!this.spotifyDevice) return STOPPED
      return this.spotifyDevice.getPlaybackState()
    }

    if (source) {
      const driver = this.drivers.get(source)
      if (!driver) return STOPPED
      return driver.getState()
    }

    if (this.active) {
      return this.active.getState()
    }

    // Spotify is not a Driver; when nothing else is active, surface SDK state if live.
    if (this.spotifyDevice) {
      const sdk = await this.spotifyDevice.getPlaybackState()
      if (sdk.state !== "stopped") return sdk
    }

    return STOPPED
  }

  async notifyNowPlaying(meta: { title?: string; artist?: string; album?: string }): Promise<void> {
    await this.nowPlaying.publish(this.roomId, meta)
  }
}
