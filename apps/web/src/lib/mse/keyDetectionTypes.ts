/**
 * Pure key-detection types and hysteresis (ADR 0171).
 * Safe to import from ChromaticTuner — no MIR package references.
 */

const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const

export type DetectedKey = {
  tonic: number
  mode: "major" | "minor"
  /** Primary library label (e.g. C, Am, C#). */
  label: string
  /**
   * Relative major/minor library label when scores are close (e.g. Am when
   * primary is C). Display shows both; null when the winner is alone.
   */
  relativeLabel: string | null
  /** Display label with sharp signs (e.g. C♯ or C / Am). */
  displayLabel: string
  /** Camelot Wheel code (e.g. 8B or 8B / 8A). */
  camelot: string
  confidence: number
}

/** Hold locked key unless the new winner is clearly stronger. */
export const KEY_HYSTERESIS_MARGIN = 0.12

/**
 * When winner and its relative major/minor are within this correlation margin,
 * show both (e.g. C / Am) instead of picking one.
 */
export const RELATIVE_CLOSE_MARGIN = 0.1

/** Open Key / Camelot: index 0 = C major / Am → 8B / 8A. */
const CAMELOT_MAJOR = [
  "8B",
  "3B",
  "10B",
  "5B",
  "12B",
  "7B",
  "2B",
  "9B",
  "4B",
  "11B",
  "6B",
  "1B",
] as const
const CAMELOT_MINOR = [
  "5A",
  "12A",
  "7A",
  "2A",
  "9A",
  "4A",
  "11A",
  "6A",
  "1A",
  "8A",
  "3A",
  "10A",
] as const

export function formatKeyDisplayLabel(label: string): string {
  // Prefer flat spellings for keys that are almost always written that way.
  const flats: Record<string, string> = {
    "C#": "D♭",
    "D#": "E♭",
    "G#": "A♭",
    "A#": "B♭",
    "C#m": "D♭m",
    "D#m": "E♭m",
    "G#m": "A♭m",
    "A#m": "B♭m",
  }
  const preferred = flats[label] ?? label
  return preferred.replace(/#/g, "♯")
}

export function camelotForKey(tonic: number, mode: "major" | "minor"): string {
  const t = ((tonic % 12) + 12) % 12
  return mode === "major" ? CAMELOT_MAJOR[t]! : CAMELOT_MINOR[t]!
}

/** Relative minor of a major (vi) or relative major of a minor (III). */
export function relativeLabelFor(tonic: number, mode: "major" | "minor"): string {
  const t = ((tonic % 12) + 12) % 12
  if (mode === "major") {
    return `${NOTE_NAMES[(t + 9) % 12]}m`
  }
  return NOTE_NAMES[(t + 3) % 12]!
}

/** Stable id for a winner + optional relative pair (order-independent). */
export function keyPairId(key: DetectedKey): string {
  if (!key.relativeLabel) return key.label
  return [key.label, key.relativeLabel].sort().join("|")
}

export function formatKeyPairDisplay(
  primaryLabel: string,
  relativeLabel: string | null,
): string {
  const primary = formatKeyDisplayLabel(primaryLabel)
  if (!relativeLabel) return primary
  return `${primary} / ${formatKeyDisplayLabel(relativeLabel)}`
}

export function formatKeyPairCamelot(
  tonic: number,
  mode: "major" | "minor",
  relativeLabel: string | null,
): string {
  const primary = camelotForKey(tonic, mode)
  if (!relativeLabel) return primary
  const relMode = relativeLabel.endsWith("m") ? "minor" : "major"
  const relTonicName = relMode === "minor" ? relativeLabel.slice(0, -1) : relativeLabel
  const relTonic = NOTE_NAMES.indexOf(relTonicName as (typeof NOTE_NAMES)[number])
  if (relTonic < 0) return primary
  return `${primary} / ${camelotForKey(relTonic, relMode)}`
}

export function applyKeyHysteresis(
  prev: DetectedKey | null,
  next: DetectedKey | null,
): DetectedKey | null {
  if (!next) return prev
  if (!prev) return next

  // Same primary tonic/mode — refresh confidence and allow solo → "C / Am" upgrade.
  if (prev.label === next.label) {
    if (next.relativeLabel && !prev.relativeLabel) return next
    if (prev.relativeLabel && !next.relativeLabel) {
      return { ...next, relativeLabel: prev.relativeLabel, displayLabel: prev.displayLabel, camelot: prev.camelot }
    }
    return {
      ...next,
      displayLabel: prev.displayLabel,
      camelot: prev.camelot,
      relativeLabel: prev.relativeLabel,
    }
  }

  // Same relative pair with flipped winner (C↔Am) — keep the first lock's readout order.
  if (keyPairId(prev) === keyPairId(next)) {
    return {
      ...next,
      label: prev.label,
      relativeLabel: prev.relativeLabel,
      displayLabel: prev.displayLabel,
      camelot: prev.camelot,
      tonic: prev.tonic,
      mode: prev.mode,
    }
  }

  // Hold previous unless the new winner is clearly stronger.
  if (next.confidence < prev.confidence + KEY_HYSTERESIS_MARGIN) {
    return prev
  }
  return next
}
