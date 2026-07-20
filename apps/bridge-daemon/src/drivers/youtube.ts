import type { Page } from "puppeteer-core"
import type { ChromeManager } from "../chrome"
import { StaticHost } from "../staticHost"
import type { Driver, DriverState } from "./Driver"

/** If embed never reaches playing after load, treat as unplayable and advance. */
const START_WATCHDOG_MS = 12_000

export class YoutubeDriver implements Driver {
  readonly source = "youtube" as const
  private page: Page | null = null
  private host = new StaticHost()
  private endedCbs: Array<(trackId: string) => void> = []
  private stateCbs: Array<(state: DriverState) => void> = []
  private currentTrackId: string | null = null
  private pollTimer: NodeJS.Timeout | null = null
  private startWatchdog: NodeJS.Timeout | null = null
  private bridgeExposed = false
  private endedForTrackId: string | null = null

  constructor(private readonly chrome: ChromeManager) {}

  async start(): Promise<void> {
    const baseUrl = await this.host.start()
    const url = `${baseUrl}/youtube.html`

    this.page = await this.chrome.getOrCreatePage("youtube")

    if (!this.bridgeExposed) {
      await this.page.exposeFunction("__bridgeEnded", (trackId: string) => {
        this.notifyEnded(trackId)
      })
      this.bridgeExposed = true
    }

    await this.page.goto(url, { waitUntil: "domcontentloaded" })

    await this.page.waitForFunction("window.__ytReady === true", { timeout: 30000 }).catch(() => {
      console.warn("[youtube] YT IFrame API ready timeout — will retry on load")
    })

    await this.page.evaluate(() => {
      // @ts-expect-error page context
      window.__onEnded((id) => window.__bridgeEnded(id))
    })
    this.pollTimer = setInterval(() => void this.emitState(), 1000)
  }

  async stop(): Promise<void> {
    this.clearStartWatchdog()
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = null
    if (this.page) {
      await this.page.evaluate("window.__stop && window.__stop()").catch(() => {})
    }
    this.currentTrackId = null
    await this.host.stop().catch(() => {})
  }

  async healthy(): Promise<boolean> {
    return !!this.page && !this.page.isClosed()
  }

  async load(trackId: string): Promise<void> {
    if (!this.page) await this.start()
    this.currentTrackId = trackId
    this.endedForTrackId = null
    await this.page!.evaluate((id) => {
      // @ts-expect-error page context
      window.__loadVideo(id)
    }, trackId)
    this.armStartWatchdog(trackId)
    await this.emitState()
  }

  async play(): Promise<void> {
    await this.page?.evaluate(() => {
      // @ts-expect-error page context
      window.__play?.()
    })
  }

  async pause(): Promise<void> {
    await this.page?.evaluate(() => {
      // @ts-expect-error page context
      window.__pause?.()
    })
  }

  async stopPlayback(): Promise<void> {
    this.clearStartWatchdog()
    await this.page?.evaluate("window.__stop && window.__stop()")
    this.currentTrackId = null
  }

  async seekTo(ms: number): Promise<void> {
    await this.page?.evaluate((m) => {
      // @ts-expect-error page context
      window.__seekTo(m)
    }, ms)
  }

  async setVolume(percent: number): Promise<void> {
    await this.page?.evaluate((v) => {
      // @ts-expect-error page context
      window.__setVolume(v)
    }, percent)
  }

  async getState(): Promise<DriverState> {
    if (!this.page) {
      return { state: "stopped", progressMs: null, durationMs: null, trackId: null }
    }
    const state = (await this.page.evaluate("window.__getState()")) as DriverState
    return { ...state, trackId: this.currentTrackId }
  }

  onEnded(cb: (trackId: string) => void): void {
    this.endedCbs.push(cb)
  }

  onStateChange(cb: (state: DriverState) => void): void {
    this.stateCbs.push(cb)
  }

  private notifyEnded(trackId: string | null | undefined) {
    const id = trackId || this.currentTrackId
    if (!id) return
    if (this.endedForTrackId === id) return
    this.endedForTrackId = id
    this.clearStartWatchdog()
    console.warn(`[youtube] unplayable/ended trackId=${id}`)
    for (const cb of this.endedCbs) cb(id)
  }

  private armStartWatchdog(trackId: string) {
    this.clearStartWatchdog()
    this.startWatchdog = setTimeout(() => {
      void (async () => {
        if (this.currentTrackId !== trackId) return
        try {
          const state = await this.getState()
          if (state.state === "playing" || state.state === "paused") return
          console.warn(
            `[youtube] start watchdog: never reached playing for ${trackId} (state=${state.state})`,
          )
          this.notifyEnded(trackId)
        } catch {
          this.notifyEnded(trackId)
        }
      })()
    }, START_WATCHDOG_MS)
  }

  private clearStartWatchdog() {
    if (this.startWatchdog) {
      clearTimeout(this.startWatchdog)
      this.startWatchdog = null
    }
  }

  private async emitState() {
    try {
      const state = await this.getState()
      if (state.state === "playing" || state.state === "paused") {
        this.clearStartWatchdog()
      }
      for (const cb of this.stateCbs) cb(state)
    } catch {
      /* ignore */
    }
  }
}
