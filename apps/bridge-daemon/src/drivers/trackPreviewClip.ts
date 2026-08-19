import { spawn } from "node:child_process"

export const PREVIEW_DURATION_SEC = 15
const MAX_CONCURRENT = 2
const PREVIEW_BITRATE = "64k"

let activeEncodes = 0
const waitQueue: Array<() => void> = []
const inFlight = new Map<string, Promise<TrackPreviewClipResult>>()

export type TrackPreviewClipResult = {
  mimeType: "audio/mpeg"
  data: string
  durationMs: number
}

export type EncodeTrackPreviewParams = {
  trackId: string
  /** Local file path or Navidrome stream.view URL (ffmpeg -i input). */
  input: string
  durationSec: number
}

function acquireSlot(): Promise<void> {
  if (activeEncodes < MAX_CONCURRENT) {
    activeEncodes++
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    waitQueue.push(() => {
      activeEncodes++
      resolve()
    })
  })
}

function releaseSlot() {
  activeEncodes = Math.max(0, activeEncodes - 1)
  const next = waitQueue.shift()
  if (next) next()
}

/** Mid-track start offset; shorter tracks encode from 0. */
export function computePreviewStartSec(durationSec: number): number {
  if (durationSec <= PREVIEW_DURATION_SEC) return 0
  return Math.max(0, durationSec / 2 - PREVIEW_DURATION_SEC / 2)
}

function runFfmpeg(input: string, startSec: number, clipDurationSec: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      String(startSec),
      "-t",
      String(clipDurationSec),
      "-i",
      input,
      "-vn",
      "-ac",
      "2",
      "-ar",
      "44100",
      "-b:a",
      PREVIEW_BITRATE,
      "-f",
      "mp3",
      "pipe:1",
    ]
    const proc = spawn("ffmpeg", args)
    const chunks: Buffer[] = []
    let stderr = ""
    proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk))
    proc.stderr.on("data", (d: Buffer) => {
      stderr += d.toString()
    })
    proc.on("error", (err) => reject(err))
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`))
        return
      }
      resolve(Buffer.concat(chunks))
    })
  })
}

export async function encodeTrackPreviewClip(
  params: EncodeTrackPreviewParams,
): Promise<TrackPreviewClipResult> {
  const key = params.trackId.trim()
  const existing = inFlight.get(key)
  if (existing) return existing

  const promise = (async () => {
    await acquireSlot()
    try {
      const clipDurationSec = Math.min(Math.max(params.durationSec, 0), PREVIEW_DURATION_SEC)
      const effectiveDuration = clipDurationSec > 0 ? clipDurationSec : PREVIEW_DURATION_SEC
      const startSec = computePreviewStartSec(params.durationSec > 0 ? params.durationSec : PREVIEW_DURATION_SEC)
      const buf = await runFfmpeg(params.input, startSec, effectiveDuration)
      return {
        mimeType: "audio/mpeg" as const,
        data: buf.toString("base64"),
        durationMs: Math.round(effectiveDuration * 1000),
      }
    } finally {
      releaseSlot()
      inFlight.delete(key)
    }
  })()

  inFlight.set(key, promise)
  return promise
}

export function ffmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("ffmpeg", ["-version"], { stdio: "ignore" })
    proc.on("error", () => resolve(false))
    proc.on("close", (code) => resolve(code === 0))
  })
}

export async function assertFfmpegAvailable(): Promise<void> {
  const ok = await ffmpegAvailable()
  if (!ok) {
    throw new Error(
      "ffmpeg is not available on PATH. Install ffmpeg on the DJ Mac to enable track previews.",
    )
  }
}

/** @deprecated Prefer assertFfmpegAvailable; musicFolder is optional when stream.view fallback is used. */
export async function assertPreviewDependencies(musicFolder: string | undefined): Promise<void> {
  if (!musicFolder?.trim()) {
    throw new Error(
      "Navidrome musicFolder is not configured on the Media Bridge. Set musicFolder in bridge config to enable track previews.",
    )
  }
  await assertFfmpegAvailable()
}
