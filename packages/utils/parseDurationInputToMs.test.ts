import { describe, expect, it } from "vitest"
import { parseDurationInputToMs } from "./parseDurationInputToMs"

describe("parseDurationInputToMs", () => {
  it("parses m:ss and bare seconds", () => {
    expect(parseDurationInputToMs("3:00")).toBe(180_000)
    expect(parseDurationInputToMs("180")).toBe(180_000)
    expect(parseDurationInputToMs("1:01:01")).toBe(3_661_000)
  })

  it("rejects incomplete input", () => {
    expect(parseDurationInputToMs("3:")).toBeNull()
    expect(parseDurationInputToMs("3:60")).toBeNull()
  })
})
