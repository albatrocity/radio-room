import type { CDPSession, Page } from "puppeteer-core"
import type { RedisClientType } from "redis"
import {
  BRIDGE_SPOTIFY_DEVICE_NAME,
  eventChannel,
  spotifyDeviceKey,
  spotifyTokenKey,
} from "@repo/adapter-bridge/protocol"
import type { ChromeManager } from "./chrome"
import type { DriverState } from "./drivers/Driver"
import type { StaticHost } from "./staticHost"

type RedisLike = RedisClientType<any, any, any>

const WATCHDOG_MS = 15_000
const TOKEN_POLL_MS = 250
const TOKEN_POLL_ATTEMPTS = 40

/**
 * Hosts the Spotify Web Playback SDK in bridge Chrome and advertises the
 * Connect device id in Redis. Not a Driver — control stays on the Web API.
 */
export class SpotifyDeviceHost {
  private page: Page | null = null
  private watchdog: NodeJS.Timeout | null = null
  private deviceId: string | null = null
  private bridgesExposed = false
  private stopped = false
  private authRecoveryInFlight = false
  /** Coalesce concurrent getOAuthToken / TOKEN_REQUEST polls. */
  private tokenFetchInFlight: Promise<string> | null = null
  private fetchSession: CDPSession | null = null

  constructor(
    private readonly chrome: ChromeManager,
    private readonly host: StaticHost,
    private readonly redis: RedisLike,
    private readonly roomId: string,
  ) {}

  async start(): Promise<void> {
    this.stopped = false
    const baseUrl = await this.host.start()
    const url = `${baseUrl}/spotify.html`
    this.page = await this.chrome.getOrCreatePage("spotify")
    await this.attachBridges()
    await this.installTrackPlaybackCorsFix()

    await this.page.bringToFront().catch(() => {})
    await this.page.goto(url, { waitUntil: "domcontentloaded" })
    await this.page.bringToFront().catch(() => {})
    // Synthetic focus so autoplay / SDK client-token paths are less likely to stall.
    await this.page
      .click("body")
      .catch(() => this.page?.mouse.click(8, 8).catch(() => {}))

    // If SDK was already ready before expose, kick boot
    await this.page
      .evaluate(() => {
        // @ts-expect-error page context
        if (window.Spotify && typeof window.__spotifyCreatePlayer === "function") {
          // @ts-expect-error page context
          window.onSpotifyWebPlaybackSDKReady?.()
        }
      })
      .catch(() => {})

    if (!this.watchdog) {
      this.watchdog = setInterval(() => void this.tickWatchdog(url), WATCHDOG_MS)
    }
    console.log(`[spotify-device] host page loading ${url}`)
  }

  async stop(): Promise<void> {
    this.stopped = true
    if (this.watchdog) clearInterval(this.watchdog)
    this.watchdog = null
    await this.teardownTrackPlaybackCorsFix()
    try {
      await this.redis.del(spotifyDeviceKey(this.roomId))
    } catch {
      /* ignore */
    }
    this.deviceId = null
    if (this.page && !this.page.isClosed()) {
      await this.page
        .evaluate(() => {
          // @ts-expect-error page context
          window.__spotifyPlayer?.disconnect?.()
        })
        .catch(() => {})
    }
    this.page = null
  }

  getDeviceId(): string | null {
    return this.deviceId
  }

  /**
   * Read live transport state from the Web Playback SDK (local to the DJ Mac).
   * Prefer this over Spotify Web API polling from the API container.
   */
  async getPlaybackState(): Promise<DriverState> {
    if (!this.page || this.page.isClosed()) {
      return { state: "stopped", progressMs: null, durationMs: null, trackId: null }
    }

    try {
      const snapshot = await this.page.evaluate(async () => {
        // @ts-expect-error page context
        const player = window.__spotifyPlayer
        if (!player || typeof player.getCurrentState !== "function") {
          return null
        }
        const state = await player.getCurrentState()
        if (!state) {
          return null
        }
        let volumePercent: number | null = null
        try {
          if (typeof player.getVolume === "function") {
            const v = await player.getVolume()
            if (typeof v === "number") {
              volumePercent = Math.round(Math.max(0, Math.min(100, v * 100)))
            }
          }
        } catch {
          /* ignore */
        }
        return {
          paused: !!state.paused,
          position: typeof state.position === "number" ? state.position : null,
          duration: typeof state.duration === "number" ? state.duration : null,
          trackId: state.track_window?.current_track?.id ?? null,
          volumePercent,
        }
      })

      if (!snapshot) {
        return { state: "stopped", progressMs: null, durationMs: null, trackId: null }
      }

      return {
        state: snapshot.paused ? "paused" : "playing",
        progressMs: snapshot.position,
        durationMs: snapshot.duration,
        trackId: snapshot.trackId,
        volumePercent: snapshot.volumePercent,
      }
    } catch (e) {
      console.warn("[spotify-device] getPlaybackState failed:", e)
      return { state: "stopped", progressMs: null, durationMs: null, trackId: null }
    }
  }

  private async onReady(deviceId: string) {
    if (this.stopped) return
    // Synthetic gesture so activateElement / autoplay policy accepts the player.
    if (this.page && !this.page.isClosed()) {
      await this.page
        .click("body")
        .catch(() => this.page?.mouse.click(8, 8).catch(() => {}))
      await this.page
        .evaluate(() => {
          // @ts-expect-error page context
          window.__spotifyPlayer?.activateElement?.()
        })
        .catch(() => {})
    }

    // SDK ready id often ≠ Connect list id for the same player — prefer listed.
    const resolvedId = await this.resolveListedDeviceId(deviceId)
    this.deviceId = resolvedId
    await this.redis.set(spotifyDeviceKey(this.roomId), resolvedId)
    console.log(`[spotify-device] ready device_id=${resolvedId} room=${this.roomId}`)
  }

  /**
   * Poll GET /me/player/devices until "Listening Room Bridge" appears and use
   * that id (Spotify frequently assigns a different id than the ready event).
   */
  private async resolveListedDeviceId(readyId: string): Promise<string> {
    const tokenKey = spotifyTokenKey(this.roomId)
    for (let attempt = 0; attempt < 8; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 400))
      }
      const token = await this.redis.get(tokenKey)
      if (!token) continue
      try {
        const res = await fetch("https://api.spotify.com/v1/me/player/devices", {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) continue
        const data = (await res.json()) as {
          devices?: Array<{ id: string | null; name: string }>
        }
        const listed = data.devices?.find(
          (d) => d.name === BRIDGE_SPOTIFY_DEVICE_NAME && d.id,
        )
        if (listed?.id) {
          if (listed.id !== readyId) {
            console.log(
              `[spotify-device] ready id ${readyId} ≠ Connect list ${listed.id}; using listed`,
            )
          }
          return listed.id
        }
      } catch {
        /* retry */
      }
    }
    console.warn(
      `[spotify-device] "${BRIDGE_SPOTIFY_DEVICE_NAME}" not in devices list yet; using ready id ${readyId}`,
    )
    return readyId
  }

  /**
   * Spotify's api.spotify.com CORS is inconsistent for the Web Playback SDK
   * iframe (sdk.scdn.co): OPTIONS often omits `authorization`, and some
   * responses omit ACAO in the browser path. Patch both stages via CDP.
   *
   * Requires Chrome launched with site-isolation disabled so the sdk.scdn.co
   * iframe shares the page target (see ChromeManager flags).
   */
  private async installTrackPlaybackCorsFix(): Promise<void> {
    if (!this.page || this.fetchSession) return
    const client = await this.page.createCDPSession()
    this.fetchSession = client

    await client.send("Fetch.enable", {
      patterns: [
        { urlPattern: "*://api.spotify.com/*", requestStage: "Request" },
        { urlPattern: "*://api.spotify.com/*", requestStage: "Response" },
      ],
    })

    client.on("Fetch.requestPaused", (event) => {
      void this.onSpotifyApiFetchPaused(client, event)
    })
    console.log("[spotify-device] CDP CORS fix enabled for api.spotify.com (request+response)")
  }

  private async onSpotifyApiFetchPaused(
    client: CDPSession,
    event: {
      requestId: string
      request: { url: string; method: string; headers: Record<string, string> }
      responseStatusCode?: number
      responseHeaders?: Array<{ name: string; value: string }>
    },
  ): Promise<void> {
    const { requestId, request } = event
    try {
      // Response stage: ensure the SDK can read the body.
      if (typeof event.responseStatusCode === "number") {
        const status = event.responseStatusCode
        // Don't rewrite redirect responses.
        if (status >= 300 && status < 400) {
          await client.send("Fetch.continueResponse", { requestId })
          return
        }
        const origin =
          request.headers["Origin"] ||
          request.headers["origin"] ||
          "https://sdk.scdn.co"
        const headers = [...(event.responseHeaders ?? [])]
        const lower = new Set(headers.map((h) => h.name.toLowerCase()))
        if (!lower.has("access-control-allow-origin")) {
          headers.push({ name: "Access-Control-Allow-Origin", value: origin })
        }
        if (!lower.has("access-control-allow-credentials")) {
          headers.push({ name: "Access-Control-Allow-Credentials", value: "true" })
        }
        // CDP requires responseCode when headers are overridden.
        await client.send("Fetch.continueResponse", {
          requestId,
          responseCode: status,
          responseHeaders: headers,
        })
        return
      }

      if (request.method === "OPTIONS") {
        const origin =
          request.headers["Origin"] ||
          request.headers["origin"] ||
          "https://sdk.scdn.co"
        const requested =
          request.headers["Access-Control-Request-Headers"] ||
          request.headers["access-control-request-headers"] ||
          "authorization,content-type,accept,client-token,origin"
        console.log(
          `[spotify-device] fulfilling Spotify API CORS preflight ${request.url.replace(/^https?:\/\/api\.spotify\.com/, "")}`,
        )
        await client.send("Fetch.fulfillRequest", {
          requestId,
          responseCode: 204,
          responseHeaders: [
            { name: "Access-Control-Allow-Origin", value: origin },
            { name: "Access-Control-Allow-Credentials", value: "true" },
            { name: "Access-Control-Allow-Methods", value: "GET,POST,PUT,DELETE,OPTIONS" },
            { name: "Access-Control-Allow-Headers", value: requested },
            { name: "Access-Control-Max-Age", value: "86400" },
            { name: "Content-Length", value: "0" },
          ],
        })
        return
      }

      // Pause response too so we can inject ACAO if Spotify omits it.
      await client.send("Fetch.continueRequest", {
        requestId,
        interceptResponse: true,
      })
    } catch (e) {
      console.warn("[spotify-device] Fetch intercept error:", e)
      try {
        if (typeof event.responseStatusCode === "number") {
          await client.send("Fetch.continueResponse", { requestId })
        } else {
          await client.send("Fetch.continueRequest", { requestId })
        }
      } catch {
        /* ignore */
      }
    }
  }

  private async teardownTrackPlaybackCorsFix(): Promise<void> {
    if (!this.fetchSession) return
    try {
      await this.fetchSession.send("Fetch.disable")
    } catch {
      /* ignore */
    }
    try {
      await this.fetchSession.detach()
    } catch {
      /* ignore */
    }
    this.fetchSession = null
  }

  /**
   * Ask the API for the room creator's current Spotify access token (same store
   * search/playback use). Redis is only a short-lived mailbox — never reuse a
   * cached copy without a fresh TOKEN_REQUEST, or search can refresh while the
   * SDK keeps a revoked token.
   */
  private async fetchAccessToken(_opts?: { forceRefresh?: boolean }): Promise<string> {
    if (this.tokenFetchInFlight) return this.tokenFetchInFlight

    this.tokenFetchInFlight = this.requestTokenFromApi().finally(() => {
      this.tokenFetchInFlight = null
    })
    return this.tokenFetchInFlight
  }

  private async requestTokenFromApi(): Promise<string> {
    const key = spotifyTokenKey(this.roomId)
    // Drop mailbox so we cannot observe a pre-request stale value.
    await this.redis.del(key).catch(() => {})

    await this.redis.publish(
      eventChannel(this.roomId),
      JSON.stringify({ type: "TOKEN_REQUEST", service: "spotify" }),
    )
    console.log(`[spotify-device] TOKEN_REQUEST published for room ${this.roomId}`)

    for (let i = 0; i < TOKEN_POLL_ATTEMPTS; i++) {
      await new Promise((r) => setTimeout(r, TOKEN_POLL_MS))
      const token = await this.redis.get(key)
      if (token) {
        console.log(
          `[spotify-device] token from API (${token.length} chars) room=${this.roomId}`,
        )
        return token
      }
    }
    console.error(
      `[spotify-device] TOKEN_REQUEST timed out for room ${this.roomId} — is the API running with bridge token provisioning for this room?`,
    )
    throw new Error("Spotify access token not available (TOKEN_REQUEST timed out)")
  }

  private async tickWatchdog(url: string) {
    if (this.stopped) return
    try {
      if (!this.page || this.page.isClosed()) {
        console.warn("[spotify-device] page closed — recreating")
        this.bridgesExposed = false
        await this.teardownTrackPlaybackCorsFix()
        this.page = await this.chrome.getOrCreatePage("spotify")
        await this.attachBridges()
        await this.installTrackPlaybackCorsFix()
        await this.page.goto(url, { waitUntil: "domcontentloaded" })
        return
      }

      const connected = await this.page
        .evaluate(() => {
          // @ts-expect-error page context
          return !!window.__spotifyPlayer
        })
        .catch(() => false)

      if (!connected) {
        console.warn("[spotify-device] SDK player missing — reloading page")
        await this.page.goto(url, { waitUntil: "domcontentloaded" })
        return
      }

      if (this.deviceId) {
        await this.redis.set(spotifyDeviceKey(this.roomId), this.deviceId)
      }
    } catch (e) {
      console.warn("[spotify-device] watchdog error:", e)
    }
  }

  private async recoverFromAuthError(url: string): Promise<void> {
    if (this.stopped || this.authRecoveryInFlight || !this.page || this.page.isClosed()) return
    this.authRecoveryInFlight = true
    try {
      console.warn(
        "[spotify-device] authentication_error — re-requesting creator token from API and reloading SDK page",
      )
      this.deviceId = null
      await this.redis.del(spotifyDeviceKey(this.roomId)).catch(() => {})
      await this.fetchAccessToken().catch((e) => {
        console.error("[spotify-device] token re-request before reload failed:", e)
      })
      await this.page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {})
    } finally {
      this.authRecoveryInFlight = false
    }
  }

  private async attachBridges(): Promise<void> {
    if (!this.page || this.bridgesExposed) return
    const baseUrl = await this.host.start()
    const url = `${baseUrl}/spotify.html`

    await this.page.exposeFunction("__bridgeGetSpotifyToken", () => this.fetchAccessToken())
    await this.page.exposeFunction("__bridgeSpotifyReady", (deviceId: string) => {
      void this.onReady(deviceId)
    })
    await this.page.exposeFunction("__bridgeSpotifyNotReady", (deviceId: string) => {
      console.warn(`[spotify-device] not_ready device_id=${deviceId}`)
    })
    await this.page.exposeFunction(
      "__bridgeSpotifyError",
      (kind: string, message: string) => {
        console.error(`[spotify-device] ${kind}: ${message}`)
        if (kind === "authentication_error") {
          console.error(
            "[spotify-device] Hint: room creator must re-link Spotify so the token includes the `streaming` scope (Premium required).",
          )
          void this.recoverFromAuthError(url)
        }
      },
    )
    await this.page.exposeFunction("__bridgeSpotifyBoot", () => {
      void this.page
        ?.evaluate(() => {
          // @ts-expect-error page context
          return window.onSpotifyWebPlaybackSDKReady?.()
        })
        .catch((e) => console.error("[spotify-device] boot failed:", e))
    })
    this.bridgesExposed = true
  }
}
