/**
 * IEC-ish VU ballistics for the inventory VU Meter (ADR 0169).
 * Game-feel mapping with headroom for loud/compressed radio: 0 VU ≈ −6 dBFS.
 * Snappier than classic 300 ms VU so the needle tracks loudness without floating.
 */

/** dBFS level treated as 0 VU (hot streams; −18 pegged most radio material). */
export const VU_ZERO_DBFS = -6

/** Needle scale floor (VU). */
export const VU_MIN = -20

/** Needle scale ceiling (VU). */
export const VU_MAX = 3

/** Time for the needle to reach ~99% on a rising edge (seconds). */
export const VU_ATTACK_SEC = 0.08

/** Time for the needle to reach ~99% on a falling edge (seconds). */
export const VU_RELEASE_SEC = 0.14

/** @deprecated Use {@link VU_ATTACK_SEC}; kept for callers that mean “settle window”. */
export const VU_BALLISTICS_SEC = VU_ATTACK_SEC

const EPS = 1e-8

/** Convert linear RMS (0…~1) to dBFS. Silence → a large negative. */
export function rmsToDbfs(rms: number): number {
  return 20 * Math.log10(Math.max(rms, EPS))
}

/** Map dBFS to VU units (0 VU = {@link VU_ZERO_DBFS}). */
export function dbfsToVu(dbfs: number): number {
  return dbfs - VU_ZERO_DBFS
}

/** RMS → VU, clamped to the display scale. */
export function rmsToVuDb(rms: number): number {
  const vu = dbfsToVu(rmsToDbfs(rms))
  return Math.min(VU_MAX, Math.max(VU_MIN, vu))
}

/**
 * Power-mean of hop RMS values (oldest→newest in `samples[0..count)`).
 * Smooths ~11 ms hops toward VU integration before ballistics.
 */
export function meanRms(samples: Float32Array, count: number): number {
  if (count <= 0) return 0
  let sumSq = 0
  const n = Math.min(count, samples.length)
  for (let i = 0; i < n; i++) {
    const r = samples[i] ?? 0
    sumSq += r * r
  }
  return Math.sqrt(sumSq / n)
}

/**
 * Exponential approach toward `target` with fast attack / slightly slower release.
 */
export function stepVuBallistics(prev: number, target: number, dtSec: number): number {
  if (!(dtSec > 0) || !Number.isFinite(dtSec)) return prev
  if (!Number.isFinite(target)) return prev
  if (!Number.isFinite(prev)) return target
  const settleSec = target > prev ? VU_ATTACK_SEC : VU_RELEASE_SEC
  const alpha = 1 - Math.pow(0.01, dtSec / settleSec)
  return prev + (target - prev) * Math.min(1, Math.max(0, alpha))
}

/**
 * Map VU (−20…+3) to a 0…1 fraction along the needle arc.
 */
export function vuToNeedleT(vu: number): number {
  const clamped = Math.min(VU_MAX, Math.max(VU_MIN, vu))
  return (clamped - VU_MIN) / (VU_MAX - VU_MIN)
}
