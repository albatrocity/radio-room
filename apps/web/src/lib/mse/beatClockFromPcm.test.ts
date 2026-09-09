import { describe, expect, it } from "vitest"
import {
  applyBpmHysteresis,
  beatIndexAt,
  energyNoveltyHops,
  phaseAlignedToTempo,
  tempoStrength,
  unwrapPhaseNear,
} from "./beatClockFromPcm"

/** Brief decaying clicks at a fixed BPM, first click at sample 0. */
function pulseTrain(bpm: number, sampleRate: number, durationSec: number): Float32Array {
  const n = Math.floor(sampleRate * durationSec)
  const out = new Float32Array(n)
  const period = Math.round((sampleRate * 60) / bpm)
  for (let i = 0; i < n; i++) {
    const phase = i % period
    out[i] = phase < 200 ? Math.sin((2 * Math.PI * phase) / 40) * Math.exp(-phase / 80) : 0
  }
  return out
}

describe("applyBpmHysteresis", () => {
  it("rounds on first lock", () => {
    expect(applyBpmHysteresis(121.4, 0.9, null)).toBe(121)
  })

  it("holds within hysteresis band", () => {
    expect(applyBpmHysteresis(130, 0.9, 120)).toBe(120)
  })

  it("rejects large jumps when confidence is weak", () => {
    expect(applyBpmHysteresis(150, 0.3, 120)).toBe(120)
  })

  it("allows large jumps when confidence is strong", () => {
    expect(applyBpmHysteresis(150, 0.8, 120)).toBe(150)
  })
})

describe("tempoStrength", () => {
  it("uses relative count when confidence is zero", () => {
    expect(tempoStrength({ count: 10, confidence: 0 }, 5)).toBeCloseTo(10 / 15)
  })

  it("returns 1 when there is no runner-up", () => {
    expect(tempoStrength({ count: 3, confidence: 0 }, 0)).toBe(1)
  })

  it("prefers a real confidence field when present", () => {
    expect(tempoStrength({ count: 10, confidence: 0.7 }, 5)).toBe(0.7)
  })
})

describe("phaseAlignedToTempo", () => {
  const sampleRate = 44100

  it("returns window end for silence", () => {
    const samples = new Float32Array(sampleRate * 4)
    expect(phaseAlignedToTempo(samples, sampleRate, 4, 120)).toBe(4)
  })

  it("locks near the click grid for a 120 BPM pulse train", () => {
    const bpm = 120
    const duration = 8
    const samples = pulseTrain(bpm, sampleRate, duration)
    const phase = phaseAlignedToTempo(samples, sampleRate, duration, bpm)
    const period = 60 / bpm
    // Phase should land on a beat boundary (clicks at 0, 0.5, 1.0, …).
    const mod = ((phase % period) + period) % period
    expect(Math.min(mod, period - mod)).toBeLessThan(0.08)
  })

  it("locks when clicks are offset mid-period", () => {
    const bpm = 120
    const sampleRateLocal = 44100
    const duration = 8
    const periodSamples = Math.round((sampleRateLocal * 60) / bpm)
    const offset = Math.floor(periodSamples * 0.35)
    const samples = new Float32Array(sampleRateLocal * duration)
    for (let i = 0; i < samples.length; i++) {
      const phase = (i + offset) % periodSamples
      samples[i] =
        phase < 200 ? Math.sin((2 * Math.PI * phase) / 40) * Math.exp(-phase / 80) : 0
    }
    const phaseSec = phaseAlignedToTempo(samples, sampleRateLocal, duration, bpm)
    const period = 60 / bpm
    // Expected click times: first click at (periodSamples - offset) / rate, then +period…
    const firstClick = (periodSamples - offset) / sampleRateLocal
    const err = Math.abs(((phaseSec - firstClick) % period + period) % period)
    expect(Math.min(err, period - err)).toBeLessThan(0.08)
  })
})

describe("unwrapPhaseNear", () => {
  it("shifts by whole periods toward the previous phase", () => {
    expect(unwrapPhaseNear(10.5, 0.5, 120)).toBeCloseTo(0.5, 5)
  })

  it("returns new phase when there is no previous", () => {
    expect(unwrapPhaseNear(3.2, null, 120)).toBe(3.2)
  })
})

describe("energyNoveltyHops", () => {
  it("is zero for flat signal after the first hop", () => {
    const samples = new Float32Array(512 * 4).fill(0.2)
    const nov = energyNoveltyHops(samples, 512)
    expect(nov[0]).toBeGreaterThan(0)
    expect(nov[1]).toBe(0)
    expect(nov[2]).toBe(0)
  })
})

describe("beatIndexAt", () => {
  it("advances once per beat period", () => {
    const clock = { bpm: 120, confidence: 1, phaseSec: 10 }
    expect(beatIndexAt(clock, 10)).toBe(0)
    expect(beatIndexAt(clock, 10.49)).toBe(0)
    expect(beatIndexAt(clock, 10.5)).toBe(1)
    expect(beatIndexAt(clock, 11)).toBe(2)
  })
})
