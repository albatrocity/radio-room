/**
 * Programme duck mixer helpers (ADR 0174).
 *
 * Remaining gains in [0, 1]: 1 = unducked, 0 = full mute.
 * Effective gain is the minimum across active sources.
 */

export type DuckSource = "preview" | "sfx"

export type DuckSources = Partial<Record<DuckSource, number>>

/** Physical Media preview — full mute (ADR 0103 / 0174). */
export const PREVIEW_DUCK_GAIN = 0

/** Sound-effect duck — ~70% down (ADR 0174). */
export const SFX_DUCK_GAIN = 0.3

export function effectiveDuckGain(sources: DuckSources): number {
  const values = Object.values(sources).filter((g): g is number => typeof g === "number")
  if (values.length === 0) return 1
  return Math.min(...values)
}

export function programmeOutput(
  volume: number,
  muted: boolean,
  duckGain: number,
): { outputVolume: number; outputMuted: boolean } {
  return {
    outputMuted: muted || duckGain === 0,
    outputVolume: volume * duckGain,
  }
}
