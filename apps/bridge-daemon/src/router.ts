import type { Driver, DriverState } from "./drivers/Driver"
import type { NowPlayingPublisher } from "./nowPlaying"
import type { Presence } from "./presence"

export class Router {
  private active: Driver | null = null
  private meta = new Map<string, { title?: string; artist?: string; album?: string }>()

  constructor(
    private readonly drivers: Map<string, Driver>,
    private readonly presence: Presence,
    private readonly nowPlaying: NowPlayingPublisher,
    private readonly roomId: string,
  ) {
    for (const driver of Array.from(drivers.values())) {
      driver.onEnded((trackId: string) => {
        void this.presence.publish({
          type: "ENDED",
          source: driver.source,
          trackId,
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

    this.meta.set(params.trackId, {
      title: params.title,
      artist: params.artist,
      album: params.album,
    })

    await driver.load(params.trackId, {
      title: params.title,
      artist: params.artist,
      album: params.album,
    })
    if (params.volumePercent != null) {
      await driver.setVolume(params.volumePercent)
    }
    await driver.play()
    this.active = driver

    await this.nowPlaying.publish(this.roomId, {
      title: params.title,
      artist: params.artist,
      album: params.album,
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

  async getPlayback(): Promise<DriverState> {
    if (!this.active) {
      return { state: "stopped", progressMs: null, durationMs: null, trackId: null }
    }
    return this.active.getState()
  }

  async notifyNowPlaying(meta: { title?: string; artist?: string; album?: string }): Promise<void> {
    await this.nowPlaying.publish(this.roomId, meta)
  }
}
