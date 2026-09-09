import { describe, expect, it, beforeEach } from "vitest"
import {
  __resetAnalysisTapForTests,
  __writeAnalysisTapSamplesForTests,
  acquireAnalysisTap,
  ENVELOPE_HOP_SAMPLES,
  fillEnvelopeAt,
  fillPcmAt,
  fillTimeDomainAt,
  getAnalysisTapRefCount,
  isAnalysisTapActive,
  releaseAnalysisTap,
} from "./analysisTap"

describe("analysisTap", () => {
  beforeEach(() => {
    __resetAnalysisTapForTests()
  })

  it("returns false when inactive", () => {
    const out = new Uint8Array(8) as Uint8Array<ArrayBuffer>
    expect(fillTimeDomainAt(1, out)).toBe(false)
    expect(isAnalysisTapActive()).toBe(false)
  })

  it("fills time-domain bytes centered on currentTime", () => {
    acquireAnalysisTap(44100)
    const pcm = new Float32Array([0, 0.5, -0.5, 0])
    __writeAnalysisTapSamplesForTests(0, pcm, 44100)

    const out = new Uint8Array(4) as Uint8Array<ArrayBuffer>
    expect(fillTimeDomainAt(2 / 44100, out)).toBe(true)
    expect(out[0]).toBe(128)
    expect(out[1]).toBe(Math.round(0.5 * 128 + 128))
    expect(out[2]).toBe(Math.round(-0.5 * 128 + 128))
    expect(out[3]).toBe(128)
  })

  it("returns false when the requested window is not decoded yet", () => {
    acquireAnalysisTap(44100)
    const out = new Uint8Array(8) as Uint8Array<ArrayBuffer>
    expect(fillTimeDomainAt(10, out)).toBe(false)
  })

  it("refcount frees only at zero", () => {
    acquireAnalysisTap(44100)
    acquireAnalysisTap(44100)
    expect(getAnalysisTapRefCount()).toBe(2)
    expect(isAnalysisTapActive()).toBe(true)

    __writeAnalysisTapSamplesForTests(0, new Float32Array([0.25]), 44100)
    releaseAnalysisTap()
    expect(getAnalysisTapRefCount()).toBe(1)
    expect(isAnalysisTapActive()).toBe(true)
    const still = new Uint8Array(1) as Uint8Array<ArrayBuffer>
    expect(fillTimeDomainAt(0, still)).toBe(true)

    releaseAnalysisTap()
    expect(getAnalysisTapRefCount()).toBe(0)
    expect(isAnalysisTapActive()).toBe(false)
    expect(fillTimeDomainAt(0, still)).toBe(false)
  })

  it("writes envelope hops from PCM", () => {
    acquireAnalysisTap(44100)
    const hops = 4
    const pcm = new Float32Array(ENVELOPE_HOP_SAMPLES * hops)
    for (let h = 0; h < hops; h++) {
      const amp = (h + 1) * 0.1
      for (let i = 0; i < ENVELOPE_HOP_SAMPLES; i++) {
        pcm[h * ENVELOPE_HOP_SAMPLES + i] = amp
      }
    }
    __writeAnalysisTapSamplesForTests(0, pcm, 44100)

    const out = new Float32Array(hops)
    const endTime = (ENVELOPE_HOP_SAMPLES * hops) / 44100
    expect(fillEnvelopeAt(endTime, out)).toBe(hops)
    expect(out[0]).toBeCloseTo(0.1, 5)
    expect(out[1]).toBeCloseTo(0.2, 5)
    expect(out[2]).toBeCloseTo(0.3, 5)
    expect(out[3]).toBeCloseTo(0.4, 5)
  })

  it("packs a partial envelope at the start so the tape can stretch to full width", () => {
    acquireAnalysisTap(44100)
    const hops = 4
    const pcm = new Float32Array(ENVELOPE_HOP_SAMPLES * hops)
    for (let h = 0; h < hops; h++) {
      const amp = (h + 1) * 0.1
      for (let i = 0; i < ENVELOPE_HOP_SAMPLES; i++) {
        pcm[h * ENVELOPE_HOP_SAMPLES + i] = amp
      }
    }
    __writeAnalysisTapSamplesForTests(0, pcm, 44100)

    const out = new Float32Array(8)
    const endTime = (ENVELOPE_HOP_SAMPLES * hops) / 44100
    expect(fillEnvelopeAt(endTime, out)).toBe(4)
    expect(out[0]).toBeCloseTo(0.1, 5)
    expect(out[1]).toBeCloseTo(0.2, 5)
    expect(out[2]).toBeCloseTo(0.3, 5)
    expect(out[3]).toBeCloseTo(0.4, 5)
  })

  it("clamps to decoded hops when currentTime is slightly ahead", () => {
    acquireAnalysisTap(44100)
    const hops = 4
    const pcm = new Float32Array(ENVELOPE_HOP_SAMPLES * hops)
    pcm.fill(0.5)
    __writeAnalysisTapSamplesForTests(0, pcm, 44100)

    const out = new Float32Array(4)
    const endTime = (ENVELOPE_HOP_SAMPLES * hops) / 44100
    expect(fillEnvelopeAt(endTime + 0.5, out)).toBe(4)
    expect(out[0]).toBeCloseTo(0.5, 5)
  })

  it("fills float PCM ending at currentTime", () => {
    acquireAnalysisTap(44100)
    const pcm = new Float32Array([0.1, 0.2, 0.3, 0.4])
    __writeAnalysisTapSamplesForTests(0, pcm, 44100)

    const out = new Float32Array(4)
    expect(fillPcmAt(4 / 44100, out)).toBe(4)
    expect(out[0]).toBeCloseTo(0.1, 5)
    expect(out[1]).toBeCloseTo(0.2, 5)
    expect(out[2]).toBeCloseTo(0.3, 5)
    expect(out[3]).toBeCloseTo(0.4, 5)
  })

  it("packs a partial PCM window at the start", () => {
    acquireAnalysisTap(44100)
    const pcm = new Float32Array([0.5, -0.5])
    __writeAnalysisTapSamplesForTests(0, pcm, 44100)

    const out = new Float32Array(8)
    expect(fillPcmAt(2 / 44100, out)).toBe(2)
    expect(out[0]).toBeCloseTo(0.5, 5)
    expect(out[1]).toBeCloseTo(-0.5, 5)
  })

  it("ignores PCM before sinceAbsoluteSample", () => {
    acquireAnalysisTap(44100)
    const pcm = new Float32Array([0.1, 0.2, 0.3, 0.4])
    __writeAnalysisTapSamplesForTests(0, pcm, 44100)

    const out = new Float32Array(4)
    expect(fillPcmAt(4 / 44100, out, 2)).toBe(2)
    expect(out[0]).toBeCloseTo(0.3, 5)
    expect(out[1]).toBeCloseTo(0.4, 5)
  })
})
