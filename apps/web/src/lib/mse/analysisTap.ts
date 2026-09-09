/**
 * MSE-aligned PCM + envelope rings for inventory radio visuals (ADR 0141 / 0167).
 *
 * Decodes the same MP3 frames appended to the MediaSource, keyed by presentation
 * time, so `audio.currentTime` maps directly to sample indices. Refcounted so
 * Oscilloscope and Beat Detector share one worker. Beat Detector reads float PCM
 * via `fillPcmAt` (Beat Detector); envelope hops remain for optional consumers.
 */

import { MPEGDecoderWebWorker } from "mpg123-decoder"
import type { MpegFrame } from "./mpegFrames"

const RING_SEC = 30
/** Envelope hop size in PCM samples (~11.6 ms @ 44.1 kHz). */
export const ENVELOPE_HOP_SAMPLES = 512
/** Rolling envelope history (optional consumers; Beat Detector uses float PCM). */
const ENVELOPE_SEC = 8

export function envelopeHopCapacity(rate: number): number {
  return Math.ceil((rate * ENVELOPE_SEC) / ENVELOPE_HOP_SAMPLES)
}

let refCount = 0
let sampleRate = 44100
let ring: Float32Array | null = null
/** Absolute sample index of the oldest sample still in the ring. */
let oldestSample = 0
/** Absolute sample index one past the last written sample. */
let writeEnd = 0

/** RMS per hop; absolute hop index = floor(sampleIndex / ENVELOPE_HOP_SAMPLES). */
let envelope: Float32Array | null = null
let envelopeOldestHop = 0
let envelopeWriteEnd = 0
/** Partial hop accumulator when PCM does not land on hop boundaries. */
let hopCarry: Float32Array | null = null
let hopCarryFilled = 0
let hopCarryStartSample = 0

let decoder: MPEGDecoderWebWorker | null = null
let decoderReady: Promise<void> | null = null
let decodeChain: Promise<void> = Promise.resolve()

function hopsInRing(rate: number): number {
  return envelopeHopCapacity(rate)
}

function ensureRing(rate: number): void {
  if (ring && rate === sampleRate) return
  sampleRate = rate
  ring = new Float32Array(Math.ceil(rate * RING_SEC))
  oldestSample = 0
  writeEnd = 0
  envelope = new Float32Array(hopsInRing(rate))
  envelopeOldestHop = 0
  envelopeWriteEnd = 0
  hopCarry = new Float32Array(ENVELOPE_HOP_SAMPLES)
  hopCarryFilled = 0
  hopCarryStartSample = 0
}

function resetRings(): void {
  ring = null
  oldestSample = 0
  writeEnd = 0
  envelope = null
  envelopeOldestHop = 0
  envelopeWriteEnd = 0
  hopCarry = null
  hopCarryFilled = 0
  hopCarryStartSample = 0
}

function freeDecoder(): void {
  decodeChain = Promise.resolve()
  const dec = decoder
  const ready = decoderReady
  decoder = null
  decoderReady = null
  resetRings()
  if (!dec) return

  // Worker handles `free` before `init` completes with
  // `decoder.free()` while `decoder` is still undefined — await ready first.
  void (async () => {
    try {
      if (ready) await ready
      await dec.free()
    } catch {
      try {
        dec.terminate()
      } catch {
        /* already dead */
      }
    }
  })()
}

async function ensureDecoder(): Promise<MPEGDecoderWebWorker | null> {
  if (typeof window === "undefined") return null
  if (!decoder) {
    decoder = new MPEGDecoderWebWorker({ enableGapless: false })
    decoderReady = decoder.ready
  }
  const ready = decoderReady
  const dec = decoder
  if (ready) await ready
  // Refcount may have dropped (and freed) while we awaited init.
  return decoder === dec ? dec : null
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

function writeEnvelopeHop(absoluteHop: number, rms: number): void {
  if (!envelope) return
  const ringLen = envelope.length
  envelope[absoluteHop % ringLen] = rms
  envelopeWriteEnd = Math.max(envelopeWriteEnd, absoluteHop + 1)
  envelopeOldestHop = Math.max(0, envelopeWriteEnd - ringLen)
}

function flushHop(buf: Float32Array, startSample: number): void {
  let sumSq = 0
  for (let i = 0; i < buf.length; i++) {
    const s = buf[i] ?? 0
    sumSq += s * s
  }
  const rms = Math.sqrt(sumSq / buf.length)
  writeEnvelopeHop(Math.floor(startSample / ENVELOPE_HOP_SAMPLES), rms)
}

function writeEnvelopeFromPcm(atAbsoluteSample: number, pcm: Float32Array): void {
  if (!hopCarry) return

  let offset = 0
  if (hopCarryFilled > 0) {
    const need = ENVELOPE_HOP_SAMPLES - hopCarryFilled
    const take = Math.min(need, pcm.length)
    hopCarry.set(pcm.subarray(0, take), hopCarryFilled)
    hopCarryFilled += take
    offset = take
    if (hopCarryFilled === ENVELOPE_HOP_SAMPLES) {
      flushHop(hopCarry, hopCarryStartSample)
      hopCarryFilled = 0
    }
  }

  while (offset + ENVELOPE_HOP_SAMPLES <= pcm.length) {
    const slice = pcm.subarray(offset, offset + ENVELOPE_HOP_SAMPLES)
    flushHop(slice, atAbsoluteSample + offset)
    offset += ENVELOPE_HOP_SAMPLES
  }

  const rem = pcm.length - offset
  if (rem > 0) {
    hopCarry.set(pcm.subarray(offset), 0)
    hopCarryFilled = rem
    hopCarryStartSample = atAbsoluteSample + offset
  }
}

function writeMonoPcm(atAbsoluteSample: number, pcm: Float32Array): void {
  if (!ring) return
  const ringLen = ring.length
  for (let i = 0; i < pcm.length; i++) {
    ring[(atAbsoluteSample + i) % ringLen] = pcm[i]!
  }
  writeEnd = Math.max(writeEnd, atAbsoluteSample + pcm.length)
  oldestSample = Math.max(0, writeEnd - ringLen)
  writeEnvelopeFromPcm(atAbsoluteSample, pcm)
}

async function decodeBatch(frames: MpegFrame[], startTimeSec: number): Promise<void> {
  if (refCount <= 0 || frames.length === 0) return
  const dec = await ensureDecoder()
  if (!dec) return

  const mpeg = concatFrameBytes(frames)
  if (mpeg.length === 0) return

  const { channelData, samplesDecoded, sampleRate: decodedRate } = await dec.decode(mpeg)
  if (refCount <= 0 || samplesDecoded === 0) return

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
  return refCount > 0
}

export function getAnalysisTapRefCount(): number {
  return refCount
}

/** Start or join the shared tap. Pair every call with `releaseAnalysisTap`. */
export function acquireAnalysisTap(sampleRateHint?: number): void {
  refCount += 1
  if (refCount === 1) {
    if (sampleRateHint) ensureRing(sampleRateHint)
    void ensureDecoder()
  }
}

/** Drop one consumer. Frees worker/rings when the last consumer releases. */
export function releaseAnalysisTap(): void {
  if (refCount <= 0) return
  refCount -= 1
  if (refCount === 0) freeDecoder()
}

export function submitFrames(frames: MpegFrame[], startTimeSec: number): void {
  if (refCount <= 0 || frames.length === 0) return
  decodeChain = decodeChain
    .then(() => decodeBatch(frames, startTimeSec))
    .catch(() => {
      /* decode errors are non-fatal for playback */
    })
}

export function fillTimeDomainAt(currentTimeSec: number, out: Uint8Array<ArrayBuffer>): boolean {
  if (refCount <= 0 || !ring || writeEnd <= oldestSample) return false

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

/**
 * Fill `out` with float PCM (oldest → newest) ending at the playhead.
 * Writes as many samples as are decoded (up to `out.length`) starting at index 0.
 * Clamps to the ring when `currentTimeSec` is slightly ahead of or behind decode.
 * When `sinceAbsoluteSample` is set, ignores PCM older than that absolute index
 * (e.g. Beat Detector epoch after a track change).
 * Returns the sample count written (0 if the tap has nothing yet).
 */
export function fillPcmAt(
  currentTimeSec: number,
  out: Float32Array,
  sinceAbsoluteSample = 0,
): number {
  if (refCount <= 0 || !ring || writeEnd <= oldestSample) return 0

  let endSample = Math.round(currentTimeSec * sampleRate)
  if (endSample > writeEnd) endSample = writeEnd
  if (endSample <= oldestSample) endSample = writeEnd

  const startFloor = Math.max(oldestSample, sinceAbsoluteSample)
  if (endSample <= startFloor) return 0

  const available = endSample - startFloor
  const copyCount = Math.min(out.length, available)
  const startSample = endSample - copyCount

  const ringLen = ring.length
  for (let i = 0; i < copyCount; i++) {
    out[i] = ring[(startSample + i) % ringLen] ?? 0
  }
  return copyCount
}

export function getAnalysisSampleRate(): number {
  return sampleRate
}

/** Absolute sample index one past the last written PCM sample (0 if empty). */
export function getAnalysisWriteEnd(): number {
  return writeEnd
}

/**
 * Fill `out` with envelope RMS hops (oldest → newest) ending at the playhead.
 * Writes as many hops as are decoded (up to `out.length`) starting at index 0.
 * Clamps to the ring when `currentTimeSec` is slightly ahead of or behind decode.
 * Returns the hop count written (0 if the tap has nothing yet).
 */
export function fillEnvelopeAt(currentTimeSec: number, out: Float32Array): number {
  if (refCount <= 0 || !envelope || envelopeWriteEnd <= envelopeOldestHop) return 0

  let endHop = Math.floor((currentTimeSec * sampleRate) / ENVELOPE_HOP_SAMPLES)
  if (endHop > envelopeWriteEnd) endHop = envelopeWriteEnd
  if (endHop <= envelopeOldestHop) endHop = envelopeWriteEnd
  if (endHop <= envelopeOldestHop) return 0

  const available = endHop - envelopeOldestHop
  const copyCount = Math.min(out.length, available)
  const startHop = endHop - copyCount

  const ringLen = envelope.length
  for (let i = 0; i < copyCount; i++) {
    out[i] = envelope[(startHop + i) % ringLen] ?? 0
  }
  return copyCount
}

export function getEnvelopeHopRate(): number {
  return sampleRate / ENVELOPE_HOP_SAMPLES
}

/** Absolute hop index one past the last written envelope hop (0 if empty). */
export function getEnvelopeWriteEnd(): number {
  return envelopeWriteEnd
}

export type AnalysisTapDebug = {
  active: boolean
  refCount: number
  sampleRate: number
  oldestSample: number
  writeEnd: number
  bufferedSec: number
  envelopeBufferedSec: number
}

export function getAnalysisTapDebug(): AnalysisTapDebug {
  const hopRate = sampleRate > 0 ? sampleRate / ENVELOPE_HOP_SAMPLES : 0
  return {
    active: refCount > 0,
    refCount,
    sampleRate,
    oldestSample,
    writeEnd,
    bufferedSec: sampleRate > 0 ? (writeEnd - oldestSample) / sampleRate : 0,
    envelopeBufferedSec:
      hopRate > 0 ? (envelopeWriteEnd - envelopeOldestHop) / hopRate : 0,
  }
}

/** Test helper — write synthetic PCM without the decoder worker. */
export function __writeAnalysisTapSamplesForTests(
  atAbsoluteSample: number,
  pcm: Float32Array,
  rate = 44100,
): void {
  if (refCount <= 0) {
    refCount = 1
  }
  ensureRing(rate)
  writeMonoPcm(atAbsoluteSample, pcm)
}

export function __resetAnalysisTapForTests(): void {
  refCount = 0
  freeDecoder()
}
