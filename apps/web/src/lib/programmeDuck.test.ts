import { describe, expect, it } from "vitest"
import {
  effectiveDuckGain,
  programmeOutput,
  PREVIEW_DUCK_GAIN,
  SFX_DUCK_GAIN,
} from "./programmeDuck"

describe("effectiveDuckGain", () => {
  it("returns 1 when no sources are active", () => {
    expect(effectiveDuckGain({})).toBe(1)
  })

  it("returns SFX gain alone", () => {
    expect(effectiveDuckGain({ sfx: SFX_DUCK_GAIN })).toBe(0.3)
  })

  it("returns preview mute when preview and sfx overlap", () => {
    expect(effectiveDuckGain({ preview: PREVIEW_DUCK_GAIN, sfx: SFX_DUCK_GAIN })).toBe(0)
  })
})

describe("programmeOutput", () => {
  it("scales volume by duck gain without muting for partial duck", () => {
    expect(programmeOutput(1, false, 0.3)).toEqual({
      outputVolume: 0.3,
      outputMuted: false,
    })
  })

  it("mutes when duck gain is 0 (preview)", () => {
    expect(programmeOutput(0.8, false, 0)).toEqual({
      outputVolume: 0,
      outputMuted: true,
    })
  })

  it("keeps user mute even when unducked", () => {
    expect(programmeOutput(1, true, 1)).toEqual({
      outputVolume: 1,
      outputMuted: true,
    })
  })
})
