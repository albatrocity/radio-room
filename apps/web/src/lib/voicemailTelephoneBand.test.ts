import { describe, expect, it } from "vitest"

import {
  applyTelephoneBandPass,
  muLawDecodeByte,
  muLawDecodeInt,
  muLawEncodeInt,
  muLawEncodeSample,
  muLawRoundTrip,
} from "./voicemailTelephoneBand"

function rms(buf: Float32Array, offset = 0): number {
  let sum = 0
  let n = 0
  for (let i = offset; i < buf.length; i++) {
    sum += buf[i]! * buf[i]!
    n++
  }
  return n === 0 ? 0 : Math.sqrt(sum / n)
}

function tone(freq: number, sampleRate: number, durationSec: number, amp = 0.5): Float32Array {
  const n = Math.floor(sampleRate * durationSec)
  const out = new Float32Array(n)
  const w = (2 * Math.PI * freq) / sampleRate
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin(w * i)
  return out
}

describe("telephone band pass", () => {
  const SAMPLE_RATE = 48000

  it("keeps a 1 kHz tone roughly in band", () => {
    const input = tone(1000, SAMPLE_RATE, 0.5)
    const output = applyTelephoneBandPass(input, SAMPLE_RATE)
    // Skip the leading transient (filter warm-up) when measuring RMS.
    const settleOffset = SAMPLE_RATE / 20
    const inRms = rms(input, settleOffset)
    const outRms = rms(output, settleOffset)
    expect(outRms).toBeGreaterThan(inRms * 0.3)
  })

  it("attenuates a 6 kHz tone outside the telephone band", () => {
    const input = tone(6000, SAMPLE_RATE, 0.5)
    const output = applyTelephoneBandPass(input, SAMPLE_RATE)
    const settleOffset = SAMPLE_RATE / 20
    const inRms = rms(input, settleOffset)
    const outRms = rms(output, settleOffset)
    expect(outRms).toBeLessThan(inRms * 0.1)
  })

  it("rejects a 6 kHz tone more than it rejects a 1 kHz tone", () => {
    const settleOffset = SAMPLE_RATE / 20
    const in1k = tone(1000, SAMPLE_RATE, 0.5)
    const in6k = tone(6000, SAMPLE_RATE, 0.5)
    const out1k = applyTelephoneBandPass(in1k, SAMPLE_RATE)
    const out6k = applyTelephoneBandPass(in6k, SAMPLE_RATE)
    const ratio1k = rms(out1k, settleOffset) / rms(in1k, settleOffset)
    const ratio6k = rms(out6k, settleOffset) / rms(in6k, settleOffset)
    expect(ratio1k).toBeGreaterThan(ratio6k * 4)
  })
})

describe("G.711 μ-law", () => {
  // G.711 has two "zero" codes: 0xFF (positive zero) and 0x7F (negative zero).
  // Both decode to pcm = 0, and an encoder canonicalizes zero to 0xFF. So
  // every byte round-trips to itself except 0x7F, which collapses to 0xFF.
  it("round-trips every 8-bit code to itself (except the negative-zero alias)", () => {
    for (let b = 0; b <= 0xff; b++) {
      if (b === 0x7f) continue
      const pcm = muLawDecodeInt(b)
      const reByte = muLawEncodeInt(pcm)
      expect(reByte).toBe(b)
    }
    // `toBe` is Object.is; decoding 0x7F returns -0, which == 0 but is not Object.is 0.
    expect(muLawDecodeInt(0x7f) === 0).toBe(true)
    expect(muLawDecodeInt(0xff) === 0).toBe(true)
    expect(muLawEncodeInt(0)).toBe(0xff)
  })

  it("quiet samples collapse to coarse segment-0 steps", () => {
    // μ-law segment 0 quantizes pcm to multiples of (1 << 3) = 8 on the
    // 14-bit linear scale. In float units the quantum is 8 / 32768.
    const n = 1000
    const samples = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      samples[i] = -0.0005 + (0.001 * i) / (n - 1)
    }
    const unique = new Set<number>()
    for (let i = 0; i < n; i++) unique.add(muLawRoundTrip(samples[i]!))

    // In the ±5e-4 range we can fit only a handful of segment-0 bins.
    expect(unique.size).toBeGreaterThan(1)
    expect(unique.size).toBeLessThanOrEqual(20)

    const sorted = Array.from(unique).sort((a, b) => a - b)
    const quantum = 8 / 32768
    for (let i = 1; i < sorted.length; i++) {
      const delta = sorted[i]! - sorted[i - 1]!
      expect(Math.abs(delta - quantum)).toBeLessThan(1e-8)
    }
  })

  it("encoded bytes and decoded floats stay in a 1-to-1 relationship (except the negative-zero alias)", () => {
    for (let b = 0; b <= 0xff; b++) {
      if (b === 0x7f) continue
      const sample = muLawDecodeByte(b)
      expect(muLawEncodeSample(sample)).toBe(b)
    }
  })
})
