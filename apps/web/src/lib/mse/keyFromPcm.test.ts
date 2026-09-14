import { describe, expect, it } from "vitest"
import {
  applyKeyHysteresis,
  camelotForKey,
  formatKeyDisplayLabel,
  formatKeyPairDisplay,
  relativeLabelFor,
  type DetectedKey,
} from "./keyDetectionTypes"
import { detectKeyFromPcm } from "./keyFromPcm"

function triad(
  freqs: number[],
  sampleRate: number,
  durationSec: number,
): Float32Array {
  const n = Math.floor(sampleRate * durationSec)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let s = 0
    for (const f of freqs) {
      s += Math.sin((2 * Math.PI * f * i) / sampleRate)
    }
    out[i] = s / freqs.length
  }
  return out
}

function key(
  label: string,
  confidence: number,
  tonic = 0,
  mode: "major" | "minor" = "major",
  relativeLabel: string | null = null,
): DetectedKey {
  return {
    tonic,
    mode,
    label,
    relativeLabel,
    displayLabel: formatKeyPairDisplay(label, relativeLabel),
    camelot: camelotForKey(tonic, mode),
    confidence,
  }
}

describe("formatKeyDisplayLabel", () => {
  it("replaces # with sharp signs and prefers flat key spellings", () => {
    expect(formatKeyDisplayLabel("F#")).toBe("F♯")
    expect(formatKeyDisplayLabel("D#")).toBe("E♭")
    expect(formatKeyDisplayLabel("Am")).toBe("Am")
    expect(formatKeyDisplayLabel("A#m")).toBe("B♭m")
  })
})

describe("relativeLabelFor", () => {
  it("maps C major ↔ A minor", () => {
    expect(relativeLabelFor(0, "major")).toBe("Am")
    expect(relativeLabelFor(9, "minor")).toBe("C")
  })
})

describe("formatKeyPairDisplay", () => {
  it("joins relative pairs with a slash", () => {
    expect(formatKeyPairDisplay("C", "Am")).toBe("C / Am")
    expect(formatKeyPairDisplay("D#", "Cm")).toBe("E♭ / Cm")
    expect(formatKeyPairDisplay("Am", null)).toBe("Am")
  })
})

describe("camelotForKey", () => {
  it("maps C major and A minor to 8B / 8A", () => {
    expect(camelotForKey(0, "major")).toBe("8B")
    expect(camelotForKey(9, "minor")).toBe("8A")
  })
})

describe("applyKeyHysteresis", () => {
  it("locks the first non-null key", () => {
    expect(applyKeyHysteresis(null, key("C", 0.8))).toMatchObject({ label: "C" })
  })

  it("holds the previous key across a weak relative flip", () => {
    const prev = key("C", 0.8, 0, "major", "Am")
    const next = key("Am", 0.82, 9, "minor", "C")
    const held = applyKeyHysteresis(prev, next)
    expect(held?.label).toBe("C")
    expect(held?.displayLabel).toBe("C / Am")
  })

  it("switches when the new winner is clearly stronger and a different pair", () => {
    const prev = key("C", 0.5, 0, "major")
    const next = key("G", 0.75, 7, "major")
    expect(applyKeyHysteresis(prev, next)?.label).toBe("G")
  })

  it("keeps prev when next is null", () => {
    const prev = key("C", 0.8)
    expect(applyKeyHysteresis(prev, null)).toBe(prev)
  })
})

describe("detectKeyFromPcm", () => {
  const sampleRate = 44100

  it("detects C major from a C major triad", async () => {
    const samples = triad([261.63, 329.63, 392.0], sampleRate, 4)
    const result = await detectKeyFromPcm(samples, sampleRate)
    expect(result?.label).toBe("C")
    expect(result?.displayLabel).toMatch(/^C/)
    expect(result?.camelot).toMatch(/^8B/)
  })

  it("detects A minor from an A minor triad", async () => {
    const samples = triad([220, 261.63, 329.63], sampleRate, 4)
    const result = await detectKeyFromPcm(samples, sampleRate)
    expect(result?.label).toBe("Am")
    expect(result?.camelot).toMatch(/^8A/)
  })

  it("shows both when a relative pair is close (C + Am content)", async () => {
    // C major triad + A minor third layered — relative pair should be near-tied.
    const samples = triad([261.63, 329.63, 392.0, 220.0], sampleRate, 4)
    const result = await detectKeyFromPcm(samples, sampleRate)
    expect(result).not.toBeNull()
    // Winner is C or Am; when close, display includes both.
    expect(["C", "Am"]).toContain(result!.label)
    if (result!.relativeLabel) {
      expect(result!.displayLabel).toMatch(/ \/ /)
      expect([result!.label, result!.relativeLabel].sort()).toEqual(["Am", "C"])
    }
  })

  it("returns null for silence", async () => {
    const samples = new Float32Array(sampleRate * 4)
    expect(await detectKeyFromPcm(samples, sampleRate)).toBeNull()
  })

  it("returns null for short windows", async () => {
    const samples = triad([261.63, 329.63, 392.0], sampleRate, 1)
    expect(await detectKeyFromPcm(samples, sampleRate)).toBeNull()
  })

  it("returns null for near-silent noise below the energy gate", async () => {
    const samples = new Float32Array(sampleRate * 4)
    let seed = 1
    for (let i = 0; i < samples.length; i++) {
      // Simple LCG white noise at negligible amplitude
      seed = (seed * 1664525 + 1013904223) >>> 0
      samples[i] = (seed / 0xffffffff - 0.5) * 1e-5
    }
    expect(await detectKeyFromPcm(samples, sampleRate)).toBeNull()
  })
})
