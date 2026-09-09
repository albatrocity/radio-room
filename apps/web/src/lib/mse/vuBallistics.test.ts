import { describe, expect, it } from "vitest"
import {
  VU_ATTACK_SEC,
  VU_MAX,
  VU_MIN,
  VU_RELEASE_SEC,
  VU_ZERO_DBFS,
  dbfsToVu,
  meanRms,
  rmsToDbfs,
  rmsToVuDb,
  stepVuBallistics,
  vuToNeedleT,
} from "./vuBallistics"

describe("rmsToDbfs / dbfsToVu", () => {
  it("maps silence to a large negative dBFS", () => {
    expect(rmsToDbfs(0)).toBeLessThan(-100)
  })

  it("maps full-scale RMS ≈ 1 to ~0 dBFS", () => {
    expect(rmsToDbfs(1)).toBeCloseTo(0, 5)
  })

  it("defines 0 VU at VU_ZERO_DBFS", () => {
    expect(dbfsToVu(VU_ZERO_DBFS)).toBe(0)
    expect(rmsToVuDb(Math.pow(10, VU_ZERO_DBFS / 20))).toBeCloseTo(0, 5)
  })

  it("keeps typical loud radio (~−14 dBFS) well below the peg", () => {
    const rms = Math.pow(10, -14 / 20)
    expect(rmsToVuDb(rms)).toBeLessThan(0)
    expect(rmsToVuDb(rms)).toBeGreaterThan(VU_MIN)
  })

  it("leaves headroom for hot peaks (~−8 dBFS) before +3 VU", () => {
    const rms = Math.pow(10, -8 / 20)
    expect(rmsToVuDb(rms)).toBeLessThan(VU_MAX)
  })

  it("maps 0 dBFS above 0 VU and clamps to the display ceiling", () => {
    const vu = rmsToVuDb(1)
    expect(vu).toBeGreaterThan(0)
    expect(vu).toBe(VU_MAX)
  })

  it("clamps very quiet signal to VU_MIN", () => {
    expect(rmsToVuDb(0)).toBe(VU_MIN)
  })
})

describe("meanRms", () => {
  it("returns 0 for empty input", () => {
    expect(meanRms(new Float32Array(0), 0)).toBe(0)
  })

  it("power-means hop RMS values", () => {
    const buf = new Float32Array([0.1, 0.2, 0.3])
    const expected = Math.sqrt((0.01 + 0.04 + 0.09) / 3)
    expect(meanRms(buf, 3)).toBeCloseTo(expected, 6)
  })
})

describe("stepVuBallistics", () => {
  it("approaches a rising target over the attack window", () => {
    let v = VU_MIN
    const target = 0
    const steps = 30
    const dt = VU_ATTACK_SEC / steps
    for (let i = 0; i < steps; i++) {
      v = stepVuBallistics(v, target, dt)
    }
    // After one attack window we should be within ~1% of the step size.
    expect(Math.abs(v - target)).toBeLessThan(0.25)
  })

  it("falls slower than it rises", () => {
    const dt = 1 / 60
    const up = stepVuBallistics(0, 3, dt)
    const down = stepVuBallistics(3, 0, dt)
    expect(Math.abs(up - 0)).toBeGreaterThan(Math.abs(3 - down))
  })

  it("reaches essentially the target after several windows", () => {
    let v = VU_MIN
    for (let i = 0; i < 120; i++) {
      v = stepVuBallistics(v, VU_MAX, 0.05)
    }
    expect(v).toBeCloseTo(VU_MAX, 1)
  })

  it("ignores non-positive dt", () => {
    expect(stepVuBallistics(1, 3, 0)).toBe(1)
    expect(stepVuBallistics(1, 3, -0.1)).toBe(1)
  })

  it("exposes snappier settle times than classic 300 ms VU", () => {
    expect(VU_ATTACK_SEC).toBeLessThan(0.2)
    expect(VU_RELEASE_SEC).toBeLessThan(0.25)
    expect(VU_RELEASE_SEC).toBeGreaterThan(VU_ATTACK_SEC)
  })
})

describe("vuToNeedleT", () => {
  it("maps the scale ends to 0 and 1", () => {
    expect(vuToNeedleT(VU_MIN)).toBe(0)
    expect(vuToNeedleT(VU_MAX)).toBe(1)
  })

  it("maps 0 VU into the upper half of the arc", () => {
    expect(vuToNeedleT(0)).toBeCloseTo((0 - VU_MIN) / (VU_MAX - VU_MIN), 5)
    expect(vuToNeedleT(0)).toBeGreaterThan(0.5)
  })
})
