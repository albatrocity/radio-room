import { describe, expect, it, beforeEach } from "vitest"
import {
  __resetAnalysisTapForTests,
  __writeAnalysisTapSamplesForTests,
  fillTimeDomainAt,
  startAnalysisTap,
  stopAnalysisTap,
} from "./analysisTap"

describe("analysisTap", () => {
  beforeEach(() => {
    __resetAnalysisTapForTests()
  })

  it("returns false when inactive", () => {
    const out = new Uint8Array(8) as Uint8Array<ArrayBuffer>
    expect(fillTimeDomainAt(1, out)).toBe(false)
  })

  it("fills time-domain bytes centered on currentTime", () => {
    startAnalysisTap(44100)
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
    startAnalysisTap(44100)
    const out = new Uint8Array(8) as Uint8Array<ArrayBuffer>
    expect(fillTimeDomainAt(10, out)).toBe(false)
  })

  it("clears state on stop", () => {
    startAnalysisTap(44100)
    __writeAnalysisTapSamplesForTests(0, new Float32Array([0.25]), 44100)
    stopAnalysisTap()
    const out = new Uint8Array(4) as Uint8Array<ArrayBuffer>
    expect(fillTimeDomainAt(0, out)).toBe(false)
  })
})
