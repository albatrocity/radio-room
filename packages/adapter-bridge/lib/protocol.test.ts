import { describe, expect, it } from "vitest"
import { bridgeRequestSchema, BRIDGE_SAY_MAX_CHARS, sanitizeBridgeSayText, bridgeSayCodePointLength } from "./protocol"

describe("BRIDGE_SAY_MAX_CHARS", () => {
  it("is 100", () => {
    expect(BRIDGE_SAY_MAX_CHARS).toBe(100)
  })
})

describe("bridgeRequestSchema TTS methods", () => {
  it("accepts listSayVoices and speak", () => {
    expect(
      bridgeRequestSchema.safeParse({ id: "1", method: "listSayVoices", params: {} }).success,
    ).toBe(true)
    expect(
      bridgeRequestSchema.safeParse({
        id: "2",
        method: "speak",
        params: { text: "hi", voice: "Samantha" },
      }).success,
    ).toBe(true)
  })
})

describe("sanitizeBridgeSayText", () => {
  it("trims and strips C0 controls", () => {
    expect(sanitizeBridgeSayText("  hello\u0000world  ")).toBe("helloworld")
    expect(sanitizeBridgeSayText("a\nb\tc")).toBe("a b c")
  })

  it("returns null for empty", () => {
    expect(sanitizeBridgeSayText("")).toBeNull()
    expect(sanitizeBridgeSayText("   ")).toBeNull()
    expect(sanitizeBridgeSayText(null)).toBeNull()
  })
})

describe("bridgeSayCodePointLength", () => {
  it("counts code points not UTF-16 units", () => {
    expect(bridgeSayCodePointLength("hi")).toBe(2)
    expect(bridgeSayCodePointLength("👍")).toBe(1)
  })
})
