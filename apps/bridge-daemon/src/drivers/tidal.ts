import { spawn, type ChildProcess } from "node:child_process"
import { existsSync } from "node:fs"
import puppeteer, { type Browser, type Page } from "puppeteer-core"
import type { BridgeDaemonConfig } from "../config"
import type { Driver, DriverState } from "./Driver"

/**
 * Tidal desktop app driven via CDP (--remote-debugging-port).
 * Control is best-effort against the media element / play button in the DOM.
 * Selectors may need updates when Tidal ships UI changes.
 */
export class TidalDriver implements Driver {
  readonly source = "tidal" as const
  private browser: Browser | null = null
  private page: Page | null = null
  private child: ChildProcess | null = null
  private endedCbs: Array<(trackId: string) => void> = []
  private stateCbs: Array<(state: DriverState) => void> = []
  private currentTrackId: string | null = null
  private state: DriverState = {
    state: "stopped",
    progressMs: null,
    durationMs: null,
    volumePercent: 100,
  }
  private pollTimer: NodeJS.Timeout | null = null
  private lastProgress = 0

  constructor(private readonly config: BridgeDaemonConfig["tidal"]) {}

  async start(): Promise<void> {
    const port = this.config.debuggingPort
    const endpoint = `http://127.0.0.1:${port}`

    try {
      this.browser = await puppeteer.connect({
        browserURL: endpoint,
        defaultViewport: null,
      })
      console.log(`[tidal] Attached to Tidal on :${port}`)
    } catch {
      const exe = this.config.executablePath
      if (!existsSync(exe)) {
        throw new Error(
          `Tidal app not found at ${exe}. Install Tidal or set tidal.executablePath in config.`,
        )
      }
      this.child = spawn(exe, [`--remote-debugging-port=${port}`], {
        stdio: "ignore",
        detached: true,
      })
      this.child.unref()
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 500))
        try {
          this.browser = await puppeteer.connect({
            browserURL: endpoint,
            defaultViewport: null,
          })
          console.log(`[tidal] Launched Tidal on :${port}`)
          break
        } catch {
          /* retry */
        }
      }
      if (!this.browser) throw new Error(`Failed to connect to Tidal CDP on :${port}`)
    }

    const pages = await this.browser.pages()
    this.page = pages[0] ?? (await this.browser.newPage())
    this.pollTimer = setInterval(() => void this.poll(), 1000)
  }

  async stop(): Promise<void> {
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = null
    await this.pause().catch(() => {})
    if (this.browser) {
      try {
        this.browser.disconnect()
      } catch {
        /* ignore */
      }
      this.browser = null
    }
    this.page = null
  }

  async healthy(): Promise<boolean> {
    return !!this.browser?.connected
  }

  async load(trackId: string): Promise<void> {
    if (!this.page) await this.start()
    this.currentTrackId = trackId
    const url = `https://listen.tidal.com/track/${trackId}`
    await this.page!.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 })
    // Try to start playback via media element or play button
    await this.page!.evaluate(async () => {
      await new Promise((r) => setTimeout(r, 1500))
      const audio = document.querySelector("audio") as HTMLMediaElement | null
      if (audio) {
        try {
          await audio.play()
          return
        } catch {
          /* fall through */
        }
      }
      const btn =
        (document.querySelector('[data-test="play"]') as HTMLElement | null) ||
        (document.querySelector('button[aria-label*="Play"]') as HTMLElement | null)
      btn?.click()
    })
    this.state = { ...this.state, state: "playing", trackId }
  }

  async play(): Promise<void> {
    await this.page?.evaluate(async () => {
      const audio = document.querySelector("audio") as HTMLMediaElement | null
      if (audio) await audio.play()
      else {
        const btn = document.querySelector('[data-test="play"]') as HTMLElement | null
        btn?.click()
      }
    })
  }

  async pause(): Promise<void> {
    await this.page?.evaluate(() => {
      const audio = document.querySelector("audio") as HTMLMediaElement | null
      if (audio) audio.pause()
      else {
        const btn =
          (document.querySelector('[data-test="pause"]') as HTMLElement | null) ||
          (document.querySelector('button[aria-label*="Pause"]') as HTMLElement | null)
        btn?.click()
      }
    })
  }

  async seekTo(ms: number): Promise<void> {
    await this.page?.evaluate((m) => {
      const audio = document.querySelector("audio") as HTMLMediaElement | null
      if (audio) audio.currentTime = m / 1000
    }, ms)
  }

  async setVolume(percent: number): Promise<void> {
    await this.page?.evaluate((v) => {
      const audio = document.querySelector("audio") as HTMLMediaElement | null
      if (audio) audio.volume = Math.max(0, Math.min(1, v / 100))
    }, percent)
    this.state = { ...this.state, volumePercent: percent }
  }

  async getState(): Promise<DriverState> {
    return { ...this.state, trackId: this.currentTrackId }
  }

  onEnded(cb: (trackId: string) => void): void {
    this.endedCbs.push(cb)
  }

  onStateChange(cb: (state: DriverState) => void): void {
    this.stateCbs.push(cb)
  }

  private async poll() {
    if (!this.page) return
    try {
      const snap = await this.page.evaluate(() => {
        const audio = document.querySelector("audio") as HTMLMediaElement | null
        if (!audio) {
          return { state: "stopped" as const, progressMs: null, durationMs: null, volumePercent: null }
        }
        return {
          state: (audio.paused ? "paused" : "playing") as "paused" | "playing",
          progressMs: Math.round(audio.currentTime * 1000),
          durationMs: Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : null,
          volumePercent: Math.round(audio.volume * 100),
        }
      })

      // Heuristic ENDED: was playing, progress near duration or progress reset after being near end
      if (
        this.state.state === "playing" &&
        snap.durationMs &&
        snap.progressMs != null &&
        snap.progressMs >= snap.durationMs - 1500
      ) {
        // wait for natural end on next ticks
      }
      if (
        this.state.state === "playing" &&
        snap.state === "paused" &&
        this.lastProgress > 0 &&
        snap.durationMs &&
        this.lastProgress >= snap.durationMs - 2000
      ) {
        const id = this.currentTrackId
        if (id) for (const cb of this.endedCbs) cb(id)
      }

      this.lastProgress = snap.progressMs ?? 0
      this.state = { ...snap, trackId: this.currentTrackId }
      for (const cb of this.stateCbs) cb(this.state)
    } catch {
      /* ignore */
    }
  }
}
