/**
 * Musical key from mono PCM via @audio/mir-chroma + @audio/mir-key (ADR 0171).
 *
 * Sync helpers are used by unit tests and by the module Worker. The Now Playing
 * UI must not import this module — only the Worker (and tests) may, so non-owners
 * never download the MIR chunk. UI imports hysteresis from keyDetectionTypes.ts.
 *
 * Use a namespace import for keyDetectionTypes (not mixed named import +
 * `export … from`) — Vite module workers otherwise throw
 * "Importing binding name '…' is not found".
 */

import * as KeyTypes from "./keyDetectionTypes"
import type { DetectedKey } from "./keyDetectionTypes"

export type { DetectedKey }

export const KEY_FRAME_SAMPLES = 4096
export const KEY_HOP_SAMPLES = 2048
/** Minimum PCM length before we attempt a lock (~2.5 frames). */
export const MIN_KEY_WINDOW_SEC = 2.5
/** Prefer winner when confidence clears this floor. */
export const MIN_KEY_CONFIDENCE = 0.35

type ChromaFn = (
  data: Float32Array | Float64Array,
  options?: { fs?: number; method?: "pcp" | "nnls" },
) => Float64Array

type KeyFn = (input: Float64Array | Float64Array[]) => {
  tonic: number
  mode: "major" | "minor"
  label: string
  confidence: number
  scores: { label: string; score: number }[]
}

/**
 * Frame PCM → chroma → KS key. Returns null when the window is too short,
 * energy is silent, or the winner is too weak.
 *
 * Callers that already hold chroma/key (Worker) pass them in; tests may also
 * import the packages and call this directly.
 */
export function detectKeyFromPcmWithFns(
  samples: Float32Array,
  sampleRate: number,
  chroma: ChromaFn,
  key: KeyFn,
): DetectedKey | null {
  if (sampleRate <= 0 || samples.length < MIN_KEY_WINDOW_SEC * sampleRate) {
    return null
  }
  if (samples.length < KEY_FRAME_SAMPLES) return null

  // Quick energy gate — silence / near-silence yields a degenerate KS tie.
  let sumSq = 0
  const step = Math.max(1, Math.floor(samples.length / 2048))
  for (let i = 0; i < samples.length; i += step) {
    const s = samples[i] ?? 0
    sumSq += s * s
  }
  const rms = Math.sqrt(sumSq / Math.ceil(samples.length / step))
  if (rms < 1e-4) return null

  const frames: Float64Array[] = []
  for (let i = 0; i + KEY_FRAME_SAMPLES <= samples.length; i += KEY_HOP_SAMPLES) {
    frames.push(chroma(samples.subarray(i, i + KEY_FRAME_SAMPLES), { fs: sampleRate }))
  }
  if (frames.length === 0) return null

  const result = key(frames)
  if (!result || !Number.isFinite(result.confidence)) return null
  if (result.confidence < MIN_KEY_CONFIDENCE) return null

  const relativeLabel = KeyTypes.relativeLabelFor(result.tonic, result.mode)
  const relativeScore =
    result.scores.find((s) => s.label === relativeLabel)?.score ?? -Infinity

  // Always lock a confident winner. Radio chroma often has close non-relative
  // runners-up; only a near-tied relative pair upgrades the readout to "C / Am".
  const showRelative =
    Number.isFinite(relativeScore) &&
    result.confidence - relativeScore <= KeyTypes.RELATIVE_CLOSE_MARGIN

  const pairedRelative = showRelative ? relativeLabel : null

  return {
    tonic: result.tonic,
    mode: result.mode,
    label: result.label,
    relativeLabel: pairedRelative,
    displayLabel: KeyTypes.formatKeyPairDisplay(result.label, pairedRelative),
    camelot: KeyTypes.formatKeyPairCamelot(result.tonic, result.mode, pairedRelative),
    confidence: result.confidence,
  }
}

/** Sync path for tests — dynamically imports MIR atoms (ok in Node/vitest). */
export async function detectKeyFromPcm(
  samples: Float32Array,
  sampleRate: number,
): Promise<DetectedKey | null> {
  const [{ default: chroma }, { default: key }] = await Promise.all([
    import("@audio/mir-chroma"),
    import("@audio/mir-key"),
  ])
  return detectKeyFromPcmWithFns(samples, sampleRate, chroma, key)
}
