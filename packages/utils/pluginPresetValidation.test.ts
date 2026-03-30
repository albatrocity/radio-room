import { describe, expect, it } from "vitest"
import { validatePreset } from "./pluginPresetValidation"

const validPreset = {
  presetName: "My Room",
  exportedAt: "2026-01-01T00:00:00.000Z",
  version: 1 as const,
  pluginConfigs: {
    "plugin-a": { foo: 1 },
    "plugin-b": {},
  },
}

describe("validatePreset", () => {
  it("accepts a well-formed preset", () => {
    const r = validatePreset(validPreset)
    expect(r.valid).toBe(true)
    expect(r.preset).toEqual(validPreset)
  })

  it("rejects non-objects", () => {
    expect(validatePreset(null).valid).toBe(false)
    expect(validatePreset(undefined).valid).toBe(false)
    expect(validatePreset("x").valid).toBe(false)
    expect(validatePreset(1).valid).toBe(false)
  })

  it("rejects wrong or missing presetName", () => {
    expect(validatePreset({ ...validPreset, presetName: 1 }).valid).toBe(false)
    expect(validatePreset({ ...validPreset, presetName: undefined }).valid).toBe(false)
  })

  it("rejects wrong version", () => {
    expect(validatePreset({ ...validPreset, version: 2 }).valid).toBe(false)
    expect(validatePreset({ ...validPreset, version: "1" }).valid).toBe(false)
  })

  it("rejects non-object pluginConfigs entries", () => {
    expect(
      validatePreset({
        ...validPreset,
        pluginConfigs: { bad: null },
      }).valid,
    ).toBe(false)
    expect(
      validatePreset({
        ...validPreset,
        pluginConfigs: { bad: "x" },
      }).valid,
    ).toBe(false)
  })
})
