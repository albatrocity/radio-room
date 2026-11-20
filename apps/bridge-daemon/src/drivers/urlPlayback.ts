import { spawn, type ChildProcess } from "node:child_process"
import { createConnection, type Socket } from "node:net"
import { existsSync, mkdirSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import { configDir } from "../config"
import type { DriverState } from "./Driver"

/**
 * Max URLs that can be queued after the currently loaded one on a single player
 * (`enqueue` mode). `replace` clears the pending list for that player and loads
 * immediately. The two sidechain players (ducked and dry) each have their own
 * queue of this size.
 */
export const URL_PLAYBACK_ENQUEUE_MAX = 8

const STOPPED: DriverState = {
  state: "stopped",
  progressMs: null,
  durationMs: null,
  trackId: null,
}

const UNOBSERVED: DriverState = { ...STOPPED, observed: false }

export type UrlPlaybackMode = "replace" | "enqueue"

export type UrlPlaybackParams = {
  url: string
  mode?: UrlPlaybackMode
  duck?: boolean
}

export function isHttpsUrl(raw: unknown): raw is string {
  if (typeof raw !== "string") return false
  try {
    const u = new URL(raw)
    return u.protocol === "https:"
  } catch {
    return false
  }
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

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void }

/**
 * One sidechain mpv process for `playUrl` (ADR 0212). Deliberately NOT a
 * `Driver`: these instances are never put in `Router.drivers`, so an active
 * `playTrack` is not paused when a URL loads and natural EOF cannot overwrite
 * the programme's `lastState` on the capability cache.
 *
 * Shape mirrors [MpvPlayback](./localPlayback.ts) to keep failure modes (socket
 * handshake, end-file ignore window) consistent.
 */
export class UrlPlayback {
  private mpv: ChildProcess | null = null
  private socket: Socket | null = null
  private pending = new Map<number, Pending>()
  private reqId = 1
  private state: DriverState = { ...STOPPED }
  private loaded: string | null = null
  private queue: string[] = []
  /** Suppress end-file emitted by loadfile replace / stop (reason "stop"). */
  private ignoreEndFileUntil = 0
  private starting: Promise<void> | null = null

  constructor(
    private readonly options: {
      /** Label used in log lines and for the IPC socket basename. */
      label: "url-ducked" | "url-dry"
      /** Resolved mpv binary (same lookup rule as MpvPlayback). */
      getMpvPath: () => string
      /** Optional `--audio-device=...`. Undefined → default output. */
      getAudioDevice: () => string | undefined
    },
  ) {}

  private get socketPath(): string {
    const name = this.options.label === "url-ducked" ? "mpv-url.sock" : "mpv-url-dry.sock"
    return join(configDir(), name)
  }

  private get label(): string {
    return this.options.label
  }

  /**
   * Ensure the mpv process is up before we loadfile. All public entry points
   * await this so `RpcServer.dispatch` can race two `playUrl`s cleanly.
   */
  private ensureStarted(): Promise<void> {
    if (this.socket && !this.socket.destroyed) return Promise.resolve()
    if (this.starting) return this.starting
    this.starting = this.start().finally(() => {
      this.starting = null
    })
    return this.starting
  }

  private async start(): Promise<void> {
    const dir = configDir()
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    try {
      if (existsSync(this.socketPath)) unlinkSync(this.socketPath)
    } catch {
      /* ignore */
    }

    const mpvPath = this.options.getMpvPath()
    const audioDevice = this.options.getAudioDevice()

    const args = [
      `--input-ipc-server=${this.socketPath}`,
      "--idle=yes",
      // Never auto-advance to a next playlist entry; the queue below drives it.
      "--keep-open=always",
      "--force-window=no",
      "--no-video",
      "--quiet",
    ]
    if (audioDevice) args.push(`--audio-device=${audioDevice}`)

    let stderr = ""
    this.mpv = spawn(mpvPath, args, { stdio: ["ignore", "ignore", "pipe"] })
    this.mpv.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8")
    })
    this.mpv.on("error", (err) => {
      console.error(`[${this.label}] failed to spawn mpv at ${mpvPath}:`, err.message)
    })
    this.mpv.on("exit", (code, signal) => {
      if (code != null && code !== 0) {
        console.error(
          `[${this.label}] mpv exited code=${code} signal=${signal} stderr=${stderr.trim()}`,
        )
      }
      this.mpv = null
    })

    const ready = await waitForPath(this.socketPath, 8000)
    if (!ready) {
      const hint =
        stderr.trim() ||
        (this.mpv?.killed === false && this.mpv?.exitCode == null
          ? "mpv still running but socket missing"
          : "mpv exited before creating the IPC socket")
      throw new Error(
        `mpv IPC socket not created at ${this.socketPath} (binary: ${mpvPath}). ${hint}`,
      )
    }
    await this.connectSocket()
    console.log(`[${this.label}] mpv ready device=${audioDevice ?? "(default)"}`)
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
            console.warn(`[${this.label}] mpv socket error:`, err.message)
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
    let msg: { request_id?: number; error?: string; event?: string; reason?: string; data?: unknown }
    try {
      msg = JSON.parse(line)
    } catch {
      return
    }
    if (msg.request_id != null && this.pending.has(msg.request_id)) {
      const p = this.pending.get(msg.request_id)!
      this.pending.delete(msg.request_id)
      if (msg.error && msg.error !== "success") {
        p.reject(new Error(String(msg.error)))
      } else {
        p.resolve(msg.data)
      }
    }
    if (msg.event === "end-file") this.handleEndFile(msg)
  }

  /**
   * Natural EOF advances the queue. `loadfile replace` and `stop` also emit
   * `end-file` (reason "stop") — [MpvPlayback](./localPlayback.ts) uses the
   * same ignore window to tell them apart.
   */
  private handleEndFile(msg: { reason?: string }) {
    this.state = { ...this.state, state: "stopped", progressMs: null }
    if (Date.now() < this.ignoreEndFileUntil) return
    const reason = msg.reason ?? "unknown"
    if (reason !== "eof" && reason !== "error") return
    this.loaded = null
    const next = this.queue.shift()
    if (!next) return
    this.loadNow(next).catch((err) => {
      console.warn(`[${this.label}] auto-advance load failed:`, err)
    })
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

  private async loadNow(url: string): Promise<void> {
    await this.ensureStarted()
    this.ignoreEndFileUntil = Date.now() + 2000
    this.loaded = url
    await this.send(["loadfile", url, "replace"])
    await this.send(["playlist-clear"]).catch(() => undefined)
    await this.send(["set_property", "pause", false])
    this.state = { ...this.state, state: "playing" }
  }

  /** Public entry point for the RPC handler. Validates + routes to this player. */
  async play(params: UrlPlaybackParams): Promise<{ queued: true; mode: UrlPlaybackMode }> {
    const mode: UrlPlaybackMode = params.mode === "enqueue" ? "enqueue" : "replace"
    if (!isHttpsUrl(params.url)) {
      throw new Error("Only https:// URLs are allowed")
    }
    if (mode === "replace") {
      // Clear this player's queue so the next natural EOF does not resurrect a
      // stale URL after the admin picked a new voicemail.
      this.queue = []
      await this.loadNow(params.url)
      return { queued: true, mode }
    }

    if (this.queue.length >= URL_PLAYBACK_ENQUEUE_MAX) {
      throw new Error(`enqueue queue is full (max ${URL_PLAYBACK_ENQUEUE_MAX})`)
    }

    // Enqueue onto this player only. If nothing is loaded yet, promote it.
    if (!this.loaded) {
      await this.loadNow(params.url)
    } else {
      this.queue.push(params.url)
    }
    return { queued: true, mode }
  }

  async pause(): Promise<void> {
    if (!this.socket) return
    await this.send(["set_property", "pause", true]).catch(() => undefined)
    this.state = { ...this.state, state: "paused" }
  }

  async resume(): Promise<void> {
    if (!this.socket) return
    await this.send(["set_property", "pause", false]).catch(() => undefined)
    if (this.loaded) this.state = { ...this.state, state: "playing" }
  }

  async stop(): Promise<void> {
    if (!this.socket) return
    this.queue = []
    this.ignoreEndFileUntil = Date.now() + 2000
    this.loaded = null
    await this.send(["stop"]).catch(() => undefined)
    this.state = { ...STOPPED }
  }

  async seekTo(ms: number): Promise<void> {
    if (!this.socket) return
    const seconds = Math.max(0, ms / 1000)
    await this.send(["seek", seconds, "absolute"]).catch(() => undefined)
  }

  /**
   * Read transport state. Returns `observed: false` (the Router's `UNOBSERVED`
   * shape) when the mpv process has not started so the deck can detect older
   * packs that lack `playUrl` and fall back to `<audio>`.
   */
  async getState(): Promise<DriverState> {
    if (!this.socket) return { ...UNOBSERVED }
    try {
      const paused = (await this.send(["get_property", "pause"])) as boolean
      const timePos = (await this.send(["get_property", "time-pos"]).catch(() => null)) as
        | number
        | null
      const duration = (await this.send(["get_property", "duration"]).catch(() => null)) as
        | number
        | null
      const idle = (await this.send(["get_property", "idle-active"]).catch(() => true)) as boolean
      this.state = {
        state: idle || !this.loaded ? "stopped" : paused ? "paused" : "playing",
        progressMs: timePos != null ? Math.round(timePos * 1000) : null,
        durationMs: duration != null ? Math.round(duration * 1000) : null,
      }
      return { ...this.state }
    } catch {
      return { ...UNOBSERVED }
    }
  }

  async shutdown(): Promise<void> {
    this.queue = []
    this.loaded = null
    if (this.socket) {
      this.ignoreEndFileUntil = Date.now() + 2000
      try {
        await this.send(["stop"])
      } catch {
        /* ignore */
      }
      this.socket.destroy()
      this.socket = null
    }
    this.mpv?.kill()
    this.mpv = null
  }

  /** Testing hook: expose current queue depth. */
  queueDepthForTests(): number {
    return this.queue.length
  }

  /** Testing hook: swap the socket for a fake (bypasses spawn). */
  attachSocketForTests(socket: Socket, loaded: string | null = null): void {
    this.socket = socket
    this.loaded = loaded
    let buffer = ""
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8")
      let idx
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 1)
        this.handleLine(line)
      }
    })
  }
}

/**
 * Composite of the two URL players (ducked + dry). Chooses which player a
 * `playUrl` call hits from its `duck` flag, and routes `source: "url"`
 * transport to the ducked player only.
 */
export type UrlSidechainConfig = {
  getMpvPath: () => string
  /** Audio device for the ducked player (mpv `--audio-device`). */
  getDuckedAudioDevice: () => string | undefined
}

export class UrlSidechain {
  readonly ducked: UrlPlayback
  readonly dry: UrlPlayback
  private readonly getDuckedAudioDevice: () => string | undefined

  constructor(config: UrlSidechainConfig) {
    this.getDuckedAudioDevice = config.getDuckedAudioDevice
    this.ducked = new UrlPlayback({
      label: "url-ducked",
      getMpvPath: config.getMpvPath,
      getAudioDevice: config.getDuckedAudioDevice,
    })
    this.dry = new UrlPlayback({
      label: "url-dry",
      getMpvPath: config.getMpvPath,
      // Dry player follows mpv's default output so it stays off the sidechain.
      getAudioDevice: () => undefined,
    })
  }

  /**
   * RPC entry for `playUrl`. `duck: true` requires `tts.audioDevice` to be
   * configured so the sidechain actually ducks the bed — fail closed the way
   * `speak` does rather than silently playing on the default output.
   */
  async playUrl(params: UrlPlaybackParams): Promise<{ queued: true; mode: UrlPlaybackMode; duck: boolean }> {
    const duck = params.duck === true
    if (duck) {
      if (!this.getDuckedAudioDevice()) {
        throw new Error(
          "No TTS audio device configured. Pick a Loopback/BlackHole device in the Media Bridge UI (not “auto”).",
        )
      }
      const r = await this.ducked.play(params)
      return { ...r, duck: true }
    }
    const r = await this.dry.play(params)
    return { ...r, duck: false }
  }

  // Transport (`source: "url"`) always targets the ducked player — the dry
  // player is advance-only, so the admin deck cannot scrub it either.
  pause() {
    return this.ducked.pause()
  }

  resume() {
    return this.ducked.resume()
  }

  stop() {
    return this.ducked.stop()
  }

  seekTo(ms: number) {
    return this.ducked.seekTo(ms)
  }

  getState() {
    return this.ducked.getState()
  }

  async shutdown(): Promise<void> {
    await this.ducked.shutdown().catch(() => {})
    await this.dry.shutdown().catch(() => {})
  }
}
