/**
 * MSE-aligned PCM ring buffer for the oscilloscope (Phase 2).
 *
 * Decodes the same MP3 frames appended to the MediaSource, keyed by presentation
 * time, so `audio.currentTime` maps directly to sample indices.
 */

import { MPEGDecoderWebWorker } from "mpg123-decoder"
import type { MpegFrame } from "./mpegFrames"

const RING_SEC = 15

let active = false
let sampleRate = 44100
let ring: Float32Array | null = null
/** Absolute sample index of the oldest sample still in the ring. */
let oldestSample = 0
/** Absolute sample index one past the last written sample. */
let writeEnd = 0
let decoder: MPEGDecoderWebWorker | null = null
let decoderReady: Promise<void> | null = null
let decodeChain: Promise<void> = Promise.resolve()

function ensureRing(rate: number): void {
  if (ring && rate === sampleRate) return
  sampleRate = rate
  ring = new Float32Array(Math.ceil(rate * RING_SEC))
  oldestSample = 0
  writeEnd = 0
}

function resetRing(): void {
  ring = null
  oldestSample = 0
  writeEnd = 0
}

async function ensureDecoder(): Promise<MPEGDecoderWebWorker | null> {
  if (typeof window === "undefined") return null
  if (!decoder) {
    decoder = new MPEGDecoderWebWorker({ enableGapless: false })
    decoderReady = decoder.ready
  }
  await decoderReady
  return decoder
}

function concatFrameBytes(frames: MpegFrame[]): Uint8Array<ArrayBuffer> {
  const total = frames.reduce((sum, frame) => sum + frame.bytes.byteLength, 0)
  const out = new Uint8Array(total) as Uint8Array<ArrayBuffer>
  let offset = 0
  for (const frame of frames) {
    out.set(frame.bytes, offset)
    offset += frame.bytes.byteLength
  }
  return out
}

function writeMonoPcm(atAbsoluteSample: number, pcm: Float32Array): void {
  if (!ring) return
  const ringLen = ring.length
  for (let i = 0; i < pcm.length; i++) {
    ring[(atAbsoluteSample + i) % ringLen] = pcm[i]!
  }
  writeEnd = Math.max(writeEnd, atAbsoluteSample + pcm.length)
  oldestSample = Math.max(0, writeEnd - ringLen)
}

async function decodeBatch(frames: MpegFrame[], startTimeSec: number): Promise<void> {
  if (!active || frames.length === 0) return
  const dec = await ensureDecoder()
  if (!dec) return

  const mpeg = concatFrameBytes(frames)
  if (mpeg.length === 0) return

  const { channelData, samplesDecoded, sampleRate: decodedRate } = await dec.decode(mpeg)
  if (!active || samplesDecoded === 0) return

  ensureRing(decodedRate)

  const mono = new Float32Array(samplesDecoded)
  const channels = channelData.length
  for (let i = 0; i < samplesDecoded; i++) {
    let sum = 0
    for (let c = 0; c < channels; c++) {
      sum += channelData[c]![i] ?? 0
    }
    mono[i] = sum / channels
  }

  const atSample = Math.round(startTimeSec * decodedRate)
  writeMonoPcm(atSample, mono)
}

export function isAnalysisTapActive(): boolean {
  return active
}

export function startAnalysisTap(sampleRateHint?: number): void {
  active = true
  if (sampleRateHint) ensureRing(sampleRateHint)
  void ensureDecoder()
}

export function submitFrames(frames: MpegFrame[], startTimeSec: number): void {
  if (!active || frames.length === 0) return
  decodeChain = decodeChain
    .then(() => decodeBatch(frames, startTimeSec))
    .catch(() => {
      /* decode errors are non-fatal for playback */
    })
}

export function fillTimeDomainAt(currentTimeSec: number, out: Uint8Array<ArrayBuffer>): boolean {
  if (!active || !ring || writeEnd <= oldestSample) return false

  const center = Math.round(currentTimeSec * sampleRate)
  const start = center - Math.floor(out.length / 2)
  const end = start + out.length
  if (start < oldestSample || end > writeEnd) return false

  const ringLen = ring.length
  for (let i = 0; i < out.length; i++) {
    const sample = ring[(start + i) % ringLen] ?? 0
    out[i] = Math.max(0, Math.min(255, Math.round(sample * 128 + 128)))
  }
  return true
}

export function stopAnalysisTap(): void {
  active = false
  decodeChain = Promise.resolve()
  if (decoder) {
    decoder.free()
    decoder = null
    decoderReady = null
  }
  resetRing()
}

export type AnalysisTapDebug = {
  active: boolean
  sampleRate: number
  oldestSample: number
  writeEnd: number
  bufferedSec: number
}

export function getAnalysisTapDebug(): AnalysisTapDebug {
  return {
    active,
    sampleRate,
    oldestSample,
    writeEnd,
    bufferedSec: sampleRate > 0 ? (writeEnd - oldestSample) / sampleRate : 0,
  }
}

/** Test helper — write synthetic PCM without the decoder worker. */
export function __writeAnalysisTapSamplesForTests(
  atAbsoluteSample: number,
  pcm: Float32Array,
  rate = 44100,
): void {
  active = true
  ensureRing(rate)
  writeMonoPcm(atAbsoluteSample, pcm)
}

export function __resetAnalysisTapForTests(): void {
  stopAnalysisTap()
}
