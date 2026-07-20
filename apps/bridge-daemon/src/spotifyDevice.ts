import type { Page } from "puppeteer-core"
import type { RedisClientType } from "redis"
import {
  BRIDGE_SPOTIFY_DEVICE_NAME,
  eventChannel,
  spotifyDeviceKey,
  spotifyTokenKey,
} from "@repo/adapter-bridge/protocol"
import type { ChromeManager } from "./chrome"
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

    await this.page.goto(url, { waitUntil: "domcontentloaded" })
    // If SDK was already ready before expose, kick boot
    await this.page
      .evaluate(() => {
        // @ts-expect-error page context
        if (window.Spotify && typeof window.__spotifyCreatePlayer === "function") {
          // @ts-expect-error page context
          window.__bridgeSpotifyBoot?.()
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

  private async fetchAccessToken(): Promise<string> {
    const key = spotifyTokenKey(this.roomId)
    let token = await this.redis.get(key)
    if (token) {
      console.log(`[spotify-device] using cached token (${token.length} chars) for room ${this.roomId}`)
      return token
    }

    await this.redis.publish(
      eventChannel(this.roomId),
      JSON.stringify({ type: "TOKEN_REQUEST", service: "spotify" }),
    )
    console.log(`[spotify-device] TOKEN_REQUEST published for room ${this.roomId}`)

    for (let i = 0; i < TOKEN_POLL_ATTEMPTS; i++) {
      await new Promise((r) => setTimeout(r, TOKEN_POLL_MS))
      token = await this.redis.get(key)
      if (token) {
        console.log(
          `[spotify-device] token arrived after TOKEN_REQUEST (${token.length} chars) room=${this.roomId}`,
        )
        return token
      }
    }
    console.error(
      `[spotify-device] TOKEN_REQUEST timed out for room ${this.roomId} — is the API running with bridge onRoomCreated for this room?`,
    )
    throw new Error("Spotify access token not available (TOKEN_REQUEST timed out)")
  }

  private async tickWatchdog(url: string) {
    if (this.stopped) return
    try {
      if (!this.page || this.page.isClosed()) {
        console.warn("[spotify-device] page closed — recreating")
        this.bridgesExposed = false
        this.page = await this.chrome.getOrCreatePage("spotify")
        await this.attachBridges()
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

  private async attachBridges(): Promise<void> {
    if (!this.page || this.bridgesExposed) return
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
        }
      },
    )
    await this.page.exposeFunction("__bridgeSpotifyBoot", () => {
      void this.page
        ?.evaluate(() => {
          // @ts-expect-error page context
          return window.__spotifyCreatePlayer?.()
        })
        .catch((e) => console.error("[spotify-device] boot failed:", e))
    })
    this.bridgesExposed = true
  }
}
