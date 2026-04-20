import { describe, it, expect } from "vitest"
import { messageMatchesTarget } from "./matching"

describe("messageMatchesTarget", () => {
  it("matches exact substring", () => {
    expect(messageMatchesTarget("I love Pink Floyd", "Pink Floyd", 0.5)).toBe(true)
  })

  it("matches fuzzy when each target word appears in the message", () => {
    expect(messageMatchesTarget("pink floyed?", "Pink Floyd", 0.55)).toBe(true)
  })

  it("rejects unrelated text", () => {
    expect(messageMatchesTarget("hello world", "Metallica", 0.35)).toBe(false)
  })

  it("does not match a single word from a long title", () => {
    expect(
      messageMatchesTarget("how", "How Music Makes You Feel Better", 0.45),
    ).toBe(false)
  })

  it("matches when every title word is represented (with per-word typos)", () => {
    expect(
      messageMatchesTarget(
        "How music makes u feel better",
        "How Music Makes You Feel Better",
        0.55,
      ),
    ).toBe(true)
  })
})
