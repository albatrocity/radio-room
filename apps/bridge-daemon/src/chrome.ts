import { execSync, spawn, type ChildProcess } from "node:child_process"
import { existsSync, mkdirSync } from "node:fs"
import puppeteer, { type Browser, type Page } from "puppeteer-core"
import type { BridgeDaemonConfig } from "./config"
import { configDir } from "./config"

export class ChromeManager {
  private browser: Browser | null = null
  private child: ChildProcess | null = null
  private pages = new Map<string, Page>()

  constructor(private readonly config: BridgeDaemonConfig["chrome"]) {}

  private userDataDir(): string {
    return this.config.userDataDir ?? `${configDir()}/chrome-profile`
  }

  /**
   * Kill a prior bridge Chrome so we can relaunch with current flags.
   * Same user-data-dir is reused (YouTube login survives).
   */
  private stopExistingInstance(): void {
    const dir = this.userDataDir()
    const port = this.config.debuggingPort
    try {
      // Prefer matching our profile path (macOS/Linux).
      execSync(`pkill -f ${JSON.stringify(dir)} || true`, { stdio: "ignore" })
    } catch {
      /* ignore */
    }
    try {
      execSync(`lsof -ti TCP:${port} -sTCP:LISTEN | xargs kill -9 2>/dev/null || true`, {
        stdio: "ignore",
      })
    } catch {
      /* ignore */
    }
  }

  async connect(): Promise<Browser> {
    if (this.browser?.connected) return this.browser

    const port = this.config.debuggingPort
    const endpoint = `http://127.0.0.1:${port}`
    const dir = this.userDataDir()
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    const exe = this.config.executablePath
    if (!existsSync(exe)) {
      throw new Error(`Chrome not found at ${exe}`)
    }

    // Always relaunch with required flags. Attaching to a long-lived Chrome
    // skips site-isolation / third-party-storage flags and breaks the Spotify
    // Web Playback SDK CORS workaround (OOPIF requests never hit page Fetch).
    this.stopExistingInstance()
    await new Promise((r) => setTimeout(r, 500))

    this.child = spawn(
      exe,
      [
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${dir}`,
        "--autoplay-policy=no-user-gesture-required",
        "--no-first-run",
        "--no-default-browser-check",
        // Keep sdk.scdn.co iframe in-process so CDP Fetch can see its requests,
        // and allow third-party storage for client-token acquisition.
        "--disable-site-isolation-trials",
        "--disable-features=IsolateOrigins,site-per-process,ThirdPartyStoragePartitioning,PartitionedCookies",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "about:blank",
      ],
      { stdio: "ignore", detached: true },
    )
    this.child.unref()

    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 250))
      try {
        this.browser = await puppeteer.connect({
          browserURL: endpoint,
          defaultViewport: null,
        })
        console.log(`[chrome] Launched Chrome on :${port} (bridge profile, SDK flags)`)
        return this.browser
      } catch {
        /* retry */
      }
    }
    throw new Error(`Failed to connect to Chrome on :${port}`)
  }

  async getOrCreatePage(key: string, url?: string): Promise<Page> {
    const browser = await this.connect()
    let page = this.pages.get(key)
    if (page && !page.isClosed()) {
      if (url) await page.goto(url, { waitUntil: "domcontentloaded" })
      return page
    }
    page = await browser.newPage()
    this.pages.set(key, page)
    if (url) await page.goto(url, { waitUntil: "domcontentloaded" })
    return page
  }

  async close(): Promise<void> {
    for (const page of Array.from(this.pages.values())) {
      try {
        if (!page.isClosed()) await page.close()
      } catch {
        /* ignore */
      }
    }
    this.pages.clear()
    if (this.browser) {
      try {
        this.browser.disconnect()
      } catch {
        /* ignore */
      }
      this.browser = null
    }
  }
}
