import { describe, expect, it } from "vitest"
import type { ChatMessage } from "@repo/types"
import { isSystemChatMessage, normalizeToken } from "./chatUtils"

describe("isSystemChatMessage", () => {
  it("detects the system user", () => {
    expect(
      isSystemChatMessage({
        user: { userId: "system", username: "System" },
      } as ChatMessage),
    ).toBe(true)
    expect(
      isSystemChatMessage({
        user: { userId: "user-1", username: "Ross" },
      } as ChatMessage),
    ).toBe(false)
  })
})

describe("normalizeToken", () => {
  it("lowercases and trims", () => {
    expect(normalizeToken("  Moonlight  ")).toBe("moonlight")
  })

  it("strips surrounding punctuation but keeps internal apostrophes", () => {
    expect(normalizeToken("don't")).toBe("don't")
    expect(normalizeToken('"Hello,"')).toBe("hello")
    expect(normalizeToken("(wait)")).toBe("wait")
  })

  it("returns empty for whitespace", () => {
    expect(normalizeToken("   ")).toBe("")
  })
})
