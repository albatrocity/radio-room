import { spawn, type ChildProcess } from "node:child_process"
import { randomUUID } from "node:crypto"
import { unlinkSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  BRIDGE_SAY_MAX_CHARS,
  bridgeSayCodePointLength,
  sanitizeBridgeSayText,
  type BridgeSayVoice,
} from "@repo/adapter-bridge"
import { resolveMacBinary } from "./resolveMacBinary"

export type TtsConfigSlice = {
  audioDevice?: string
  mpvPath?: string
}

/**
 * Parse `say -v '?'` stdout and keep English voices only (`en`, `en_US`, `en_GB`, …).
 * Lines look like: `Alex                en_US    # Most people recognize me by my voice.`
 * Voice names may contain spaces (e.g. `Bad News`).
 */
export function parseSayVoicesOutput(stdout: string): BridgeSayVoice[] {
  const voices: BridgeSayVoice[] = []
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trimEnd()
    if (!trimmed.trim()) continue
    // Locale is typically xx_YY; voice name is everything before the locale column.
    const match = trimmed.match(/^(.+?)\s+([a-z]{2}[_-][A-Za-z0-9]+)\s+#/)
    if (!match) continue
    const id = match[1]!.trim()
    const locale = match[2]!.replace("-", "_")
    if (!id) continue
    const lang = locale.split("_")[0]?.toLowerCase()
    if (lang !== "en") continue
    voices.push({ id, name: id, locale })
  }
  return voices
}

/**
 * Parse `mpv --audio-device=help` stderr/stdout. Skip `auto`.
 * mpv 0.39+ wraps ids in single quotes: `  'coreaudio/BlackHole2ch_UID' (BlackHole 2ch)`
 * Older builds omit quotes: `  coreaudio/BlackHole2ch_UID (BlackHole 2ch)`
 * Prefer `coreaudio/…` and drop duplicate `avfoundation/…` rows that mirror the same UID.
 */
export function parseMpvAudioDevicesOutput(raw: string): Array<{ id: string; label: string }> {
  const devices: Array<{ id: string; label: string }> = []
  const seen = new Set<string>()
  const avfoundationFallback: Array<{ id: string; label: string }> = []
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s+(?:'([^']+)'|(\S+))\s*(?:\(([^)]*)\))?\s*$/)
    if (!match) continue
    const id = (match[1] ?? match[2] ?? "").trim()
    if (!id || id.toLowerCase() === "auto") continue
    const label = (match[3]?.trim() || id).trim()
    if (id.startsWith("avfoundation/")) {
      avfoundationFallback.push({ id, label })
      continue
    }
    if (seen.has(id)) continue
    seen.add(id)
    devices.push({ id, label })
  }
  // Only expose avfoundation devices when coreaudio listed nothing useful.
  if (devices.length === 0) {
    for (const d of avfoundationFallback) {
      if (seen.has(d.id)) continue
      seen.add(d.id)
      devices.push(d)
    }
  }
  return devices
}

/** Strip accidental quotes from a saved mpv device id; empty/`auto` ⇒ undefined. */
export function normalizeTtsAudioDevice(raw: string | undefined | null): string | undefined {
  if (raw == null) return undefined
  let id = raw.trim()
  if (
    (id.startsWith("'") && id.endsWith("'")) ||
    (id.startsWith('"') && id.endsWith('"'))
  ) {
    id = id.slice(1, -1).trim()
  }
  if (!id || id.toLowerCase() === "auto") return undefined
  return id
}

function runCapture(
  bin: string,
  args: string[],
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    child.stdout?.on("data", (c: Buffer) => {
      stdout += c.toString("utf8")
    })
    child.stderr?.on("data", (c: Buffer) => {
      stderr += c.toString("utf8")
    })
    child.on("error", reject)
    child.on("close", (code) => resolve({ code, stdout, stderr }))
  })
}

/**
 * Media Bridge TTS: macOS `say` → temp AIFF → separate mpv to configured device (ADR 0177).
 * Never touches Physical Media's idle mpv / IPC socket.
 */
export class TtsService {
  private queue: Promise<void> = Promise.resolve()
  private getConfig: () => TtsConfigSlice

  constructor(getConfig: () => TtsConfigSlice) {
    this.getConfig = getConfig
  }

  async listVoices(): Promise<BridgeSayVoice[]> {
    const sayPath = resolveMacBinary("say", "/usr/bin/say")
    const { stdout, stderr, code } = await runCapture(sayPath, ["-v", "?"])
    if (code !== 0 && !stdout.trim()) {
      throw new Error(stderr.trim() || "say is not available on this Mac")
    }
    return parseSayVoicesOutput(stdout || stderr)
  }

  async listAudioDevices(): Promise<Array<{ id: string; label: string }>> {
    const cfg = this.getConfig()
    const mpvPath = resolveMacBinary("mpv", cfg.mpvPath ?? "mpv")
    const { stdout, stderr } = await runCapture(mpvPath, ["--audio-device=help"])
    return parseMpvAudioDevicesOutput(`${stdout}\n${stderr}`)
  }

  /**
   * Synthesize then enqueue playback. Resolves after `say` succeeds and the job is queued —
   * does not wait for mpv to finish.
   */
  async speak(params: { text: string; voice: string }): Promise<{ queued: true }> {
    const text = sanitizeBridgeSayText(params.text)
    if (!text) throw new Error("Enter a message to send.")
    if (bridgeSayCodePointLength(text) > BRIDGE_SAY_MAX_CHARS) {
      throw new Error(`Message must be ${BRIDGE_SAY_MAX_CHARS} characters or fewer.`)
    }
    const voice = params.voice.trim()
    if (!voice) throw new Error("Choose a voice.")

    const cfg = this.getConfig()
    const audioDevice = normalizeTtsAudioDevice(cfg.audioDevice)
    if (!audioDevice) {
      throw new Error(
        "No TTS audio device configured. Pick a Loopback/BlackHole device in the Media Bridge UI (not “auto”).",
      )
    }

    const voices = await this.listVoices()
    if (!voices.some((v) => v.id === voice)) {
      throw new Error(`Unknown voice: ${voice}`)
    }

    const aiffPath = join(tmpdir(), `lr-tts-${randomUUID()}.aiff`)
    const sayPath = resolveMacBinary("say", "/usr/bin/say")
    console.log(`[tts] synthesizing voice=${JSON.stringify(voice)} device=${audioDevice} chars=${bridgeSayCodePointLength(text)}`)
    const { code, stderr } = await runCapture(sayPath, ["-v", voice, "-o", aiffPath, "--", text])
    if (code !== 0 || !existsSync(aiffPath)) {
      try {
        if (existsSync(aiffPath)) unlinkSync(aiffPath)
      } catch {
        /* ignore */
      }
      throw new Error(stderr.trim() || "say failed to synthesize speech")
    }
    console.log(`[tts] say ok path=${aiffPath} — queuing mpv`)

    // Enqueue playback without awaiting — RPC must return before mpv finishes.
    this.queue = this.queue
      .then(() => this.playAiff(aiffPath, audioDevice, cfg.mpvPath ?? "mpv"))
      .catch((e) => {
        console.error("[tts] playback queue error:", e)
        try {
          if (existsSync(aiffPath)) unlinkSync(aiffPath)
        } catch {
          /* ignore */
        }
      })
    return { queued: true }
  }

  private playAiff(aiffPath: string, audioDevice: string, mpvConfigured: string): Promise<void> {
    return new Promise((resolve) => {
      const mpvPath = resolveMacBinary("mpv", mpvConfigured)
      let child: ChildProcess | null = null
      const cleanup = () => {
        try {
          if (existsSync(aiffPath)) unlinkSync(aiffPath)
        } catch {
          /* ignore */
        }
        resolve()
      }
      try {
        // Keep ao/status errors visible — `--really-quiet` hides why exit code 2 happened.
        child = spawn(
          mpvPath,
          [
            "--no-video",
            "--quiet",
            "--msg-level=ao=error,cplayer=error",
            `--audio-device=${audioDevice}`,
            aiffPath,
          ],
          { stdio: ["ignore", "ignore", "pipe"] },
        )
      } catch (e) {
        console.error("[tts] mpv spawn failed:", e)
        cleanup()
        return
      }
      console.log(`[tts] mpv started pid=${child.pid} device=${audioDevice}`)
      let stderr = ""
      child.stderr?.on("data", (c: Buffer) => {
        stderr += c.toString("utf8")
      })
      child.on("error", (err) => {
        console.error("[tts] mpv error:", err.message)
        cleanup()
      })
      child.on("close", (code) => {
        if (code != null && code !== 0) {
          console.error(
            `[tts] mpv exited code=${code} device=${audioDevice} file=${aiffPath} stderr=${stderr.trim() || "(empty)"}`,
          )
        } else {
          console.log(`[tts] mpv finished ok device=${audioDevice}`)
        }
        cleanup()
      })
    })
  }
}
