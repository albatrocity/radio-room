/**
 * Phase-locked BPM / beat clock via realtime-bpm-analyzer offline API (ADR 0168).
 *
 * Builds an AudioBuffer from MSE PCM and calls `analyzeFullBuffer` — never routes the
 * radio element through MediaElementSource / destination.
 *
 * Pulse phase is re-estimated each analysis against energy novelty at the locked tempo
 * so the metronome sits on downbeats / onsets rather than mid-beat.
 *
 * `realtime-bpm-analyzer` is loaded on demand (see {@link preloadBeatDetectionLibrary}) so
 * listeners without the Beat Detector item never download it.
 */

export type LockedBeatClock = {
  bpm: number
  confidence: number
  /** Absolute media time (seconds) of a reference beat. */
  phaseSec: number
}

type AnalyzeFullBuffer = (
  buffer: AudioBuffer,
  options?: { frequencyValue?: number; qualityValue?: number },
) => Promise<readonly { readonly tempo: number; readonly count: number; readonly confidence: number }[]>

let analyzeFullBufferLoader: Promise<AnalyzeFullBuffer> | null = null

async function loadAnalyzeFullBuffer(): Promise<AnalyzeFullBuffer> {
  if (!analyzeFullBufferLoader) {
    analyzeFullBufferLoader = import("realtime-bpm-analyzer").then((m) => m.analyzeFullBuffer)
  }
  return analyzeFullBufferLoader
}

/** Kick off the dynamic import early (Beat Detector mount). Safe to call repeatedly. */
export function preloadBeatDetectionLibrary(): void {
  void loadAnalyzeFullBuffer()
}

const MIN_WINDOW_SEC = 2.5
/** Prefer relative interval-count strength; library leaves `confidence` at 0. */
const MIN_COUNT = 1
const HYSTERESIS_BPM = 12
const MAX_BPM_JUMP = 10
const STRONG_CONFIDENCE = 0.6
const ENERGY_HOP = 512
/** Phase search uses this much of the window (tail). */
const PHASE_WINDOW_SEC = 12
/** Candidate phase steps as a fraction of one beat period. */
const PHASE_STEPS = 48

export function applyBpmHysteresis(
  rawBpm: number,
  confidence: number,
  prevBpm: number | null,
): number {
  let nextBpm = Math.round(rawBpm)
  if (prevBpm == null) return nextBpm
  const delta = Math.abs(nextBpm - prevBpm)
  if (delta <= HYSTERESIS_BPM) return prevBpm
  if (delta > MAX_BPM_JUMP && confidence < STRONG_CONFIDENCE) return prevBpm
  return nextBpm
}

/** Normalize library Tempo ranking — `confidence` is unused (always 0); use `count`. */
export function tempoStrength(
  top: { count: number; confidence?: number },
  secondCount = 0,
): number {
  if (typeof top.confidence === "number" && top.confidence > 0) return top.confidence
  if (top.count <= 0) return 0
  if (secondCount <= 0) return 1
  return top.count / (top.count + secondCount)
}

/** Positive RMS first-difference novelty over hops. */
export function energyNoveltyHops(
  samples: Float32Array,
  hopSamples = ENERGY_HOP,
): Float32Array {
  const nHops = Math.floor(samples.length / hopSamples)
  const out = new Float32Array(Math.max(0, nHops))
  let prevRms = 0
  for (let h = 0; h < nHops; h++) {
    const base = h * hopSamples
    let sumSq = 0
    for (let j = 0; j < hopSamples; j++) {
      const s = samples[base + j] ?? 0
      sumSq += s * s
    }
    const rms = Math.sqrt(sumSq / hopSamples)
    out[h] = Math.max(0, rms - prevRms)
    prevRms = rms
  }
  return out
}

/**
 * Absolute media time of a beat near `windowEndSec`, aligned so energy-novelty
 * peaks land on the metronome grid for `bpm`.
 */
export function phaseAlignedToTempo(
  samples: Float32Array,
  sampleRate: number,
  windowEndSec: number,
  bpm: number,
): number {
  const period = 60 / bpm
  if (sampleRate <= 0 || period <= 0 || samples.length < ENERGY_HOP * 4) {
    return windowEndSec
  }

  const windowStartSec = windowEndSec - samples.length / sampleRate
  const hopSec = ENERGY_HOP / sampleRate

  const useSamples = Math.min(samples.length, Math.floor(PHASE_WINDOW_SEC * sampleRate))
  const offsetSamples = samples.length - useSamples
  const novelty = energyNoveltyHops(samples.subarray(offsetSamples))
  if (novelty.length < 4) return windowEndSec

  const periodHops = period / hopSec
  if (periodHops < 2) return windowEndSec

  let bestScore = -1
  let bestPhaseHops = 0
  for (let step = 0; step < PHASE_STEPS; step++) {
    const phaseHops = (step / PHASE_STEPS) * periodHops
    let score = 0
    for (let h = 0; h < novelty.length; h++) {
      const n = novelty[h] ?? 0
      if (n <= 0) continue
      // Distance to nearest beat in [0, periodHops), triangular weight.
      let d = Math.abs((h - phaseHops) % periodHops)
      if (d > periodHops / 2) d = periodHops - d
      const weight = 1 - d / (periodHops / 2)
      if (weight > 0) score += n * weight
    }
    if (score > bestScore) {
      bestScore = score
      bestPhaseHops = phaseHops
    }
  }

  if (bestScore <= 0) return windowEndSec

  // Absolute time of the phase grid origin inside the used window.
  const phaseRelSec = offsetSamples / sampleRate + bestPhaseHops * hopSec
  const origin = windowStartSec + phaseRelSec
  // Project to the last beat at or before the playhead for a stable metronome anchor.
  const k = Math.floor((windowEndSec - origin) / period)
  return origin + k * period
}

/**
 * Shift `phaseSec` by whole beat periods so it stays near `prevPhaseSec`
 * (avoids beat-index jumps when re-locking).
 */
export function unwrapPhaseNear(
  phaseSec: number,
  prevPhaseSec: number | null,
  bpm: number,
): number {
  if (prevPhaseSec == null) return phaseSec
  const period = 60 / bpm
  if (period <= 0) return phaseSec
  const n = Math.round((phaseSec - prevPhaseSec) / period)
  return phaseSec - n * period
}

function createMonoAudioBuffer(
  samples: Float32Array,
  sampleRate: number,
): AudioBuffer | null {
  const Offline =
    typeof OfflineAudioContext !== "undefined"
      ? OfflineAudioContext
      : typeof (globalThis as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
            .webkitOfflineAudioContext !== "undefined"
        ? (globalThis as { webkitOfflineAudioContext: typeof OfflineAudioContext })
            .webkitOfflineAudioContext
        : null
  if (!Offline || samples.length === 0 || sampleRate <= 0) return null

  try {
    const ctx = new Offline(1, samples.length, sampleRate)
    const buffer = ctx.createBuffer(1, samples.length, sampleRate)
    buffer.getChannelData(0).set(samples)
    return buffer
  } catch {
    return null
  }
}

/**
 * Run offline BPM analysis on mono PCM ending at `windowEndSec`.
 * Returns null when the window is too short, Web Audio is unavailable, or ranking is empty.
 * Always refreshes phase against energy peaks at the locked tempo.
 */
export async function lockBeatClockFromPcm(
  samples: Float32Array,
  sampleRate: number,
  windowEndSec: number,
  prevBpm: number | null,
  prevPhaseSec: number | null = null,
): Promise<LockedBeatClock | null> {
  if (sampleRate <= 0 || samples.length < MIN_WINDOW_SEC * sampleRate) return null

  const audioBuffer = createMonoAudioBuffer(samples, sampleRate)
  if (!audioBuffer) return null

  let tempos
  try {
    const analyzeFullBuffer = await loadAnalyzeFullBuffer()
    tempos = await analyzeFullBuffer(audioBuffer)
  } catch {
    return null
  }

  const top = tempos[0]
  if (!top || !Number.isFinite(top.tempo) || top.tempo <= 0 || top.count < MIN_COUNT) {
    return null
  }

  const confidence = tempoStrength(top, tempos[1]?.count ?? 0)
  const nextBpm = applyBpmHysteresis(top.tempo, confidence, prevBpm)
  const aligned = phaseAlignedToTempo(samples, sampleRate, windowEndSec, nextBpm)
  const phaseSec = unwrapPhaseNear(aligned, prevPhaseSec, nextBpm)

  return { bpm: nextBpm, confidence, phaseSec }
}

/** Integer beat index at `timeSec` for a locked clock (can be negative before phase). */
export function beatIndexAt(clock: LockedBeatClock, timeSec: number): number {
  const period = 60 / clock.bpm
  if (period <= 0) return 0
  return Math.floor((timeSec - clock.phaseSec) / period)
}
