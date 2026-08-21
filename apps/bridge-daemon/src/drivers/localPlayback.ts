import { spawn, type ChildProcess } from "node:child_process"
import { createConnection, type Socket } from "node:net"
import { existsSync, mkdirSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import type { BridgeDaemonConfig } from "../config"
import { configDir } from "../config"
import { resolveMacBinary } from "../resolveMacBinary"
import type { DriverState } from "./Driver"

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

/**
 * mpv process + IPC for local library playback.
 * LocalDriver supplies stream URLs; this module owns lifecycle and transport.
 */
export class MpvPlayback {
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

  constructor(private readonly mpvConfig: BridgeDaemonConfig["mpv"]) {
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

    const mpvPath = resolveMacBinary("mpv", this.mpvConfig.path)

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

  async load(trackId: string, streamUrl: string, navidromeUrl: string): Promise<void> {
    if (!this.socket) await this.start()
    this.ignoreEndFileUntil = Date.now() + 2000
    this.endedForTrackId = null
    this.currentTrackId = trackId
    console.log(
      `[local] loadfile trackId=${trackId} via ${navidromeUrl} (mpv → system audio; Audio Hijack must capture mpv)`,
    )
    await this.send(["loadfile", streamUrl, "replace"])
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
