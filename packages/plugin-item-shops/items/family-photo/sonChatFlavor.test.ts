import { describe, expect, it } from "vitest"
import { FAMILY_PHOTO_DURATION_MS } from "./constants"
import {
  SON_CHAT_FLAVOR_EARLY,
  SON_CHAT_FLAVOR_LATE,
  SON_CHAT_FLAVOR_MID,
  flavorSonChatMessage,
  selectSonChatFlavorBank,
  selectSonChatFlavorStage,
} from "./sonChatFlavor"

describe("selectSonChatFlavorStage", () => {
  const total = FAMILY_PHOTO_DURATION_MS

  it("picks early when remaining is above 2/3", () => {
    expect(selectSonChatFlavorStage(total * 0.9, total)).toBe("early")
  })

  it("picks mid when remaining is between 1/3 and 2/3", () => {
    expect(selectSonChatFlavorStage(total * 0.5, total)).toBe("mid")
  })

  it("picks late when remaining is at or below 1/3", () => {
    expect(selectSonChatFlavorStage(total * 0.1, total)).toBe("late")
  })
})

describe("selectSonChatFlavorBank", () => {
  const total = FAMILY_PHOTO_DURATION_MS

  it("returns the early bank for high remaining", () => {
    expect(selectSonChatFlavorBank(total * 0.9, total)).toBe(SON_CHAT_FLAVOR_EARLY)
  })

  it("returns the mid bank for medium remaining", () => {
    expect(selectSonChatFlavorBank(total * 0.5, total)).toBe(SON_CHAT_FLAVOR_MID)
  })

  it("returns the late bank for low remaining", () => {
    expect(selectSonChatFlavorBank(total * 0.1, total)).toBe(SON_CHAT_FLAVOR_LATE)
  })
})

describe("flavorSonChatMessage", () => {
  it("substitutes the original message into an early-bank template", () => {
    const result = flavorSonChatMessage("hello", {
      remainingMs: FAMILY_PHOTO_DURATION_MS,
      random: () => 0,
    })
    expect(result).toBe(SON_CHAT_FLAVOR_EARLY[0]!.replace("{originalMessage}", "hello"))
    expect(result).toContain("hello")
  })

  it("uses the mid bank when remaining is mid-range", () => {
    const result = flavorSonChatMessage("hello", {
      remainingMs: FAMILY_PHOTO_DURATION_MS * 0.5,
      random: () => 0,
    })
    expect(result).toBe(SON_CHAT_FLAVOR_MID[0]!.replace("{originalMessage}", "hello"))
  })

  it("uses the late bank when remaining is low (no parroting)", () => {
    const result = flavorSonChatMessage("hello", {
      remainingMs: FAMILY_PHOTO_DURATION_MS * 0.1,
      random: () => 0,
    })
    expect(result).toBe(SON_CHAT_FLAVOR_LATE[0])
    expect(result).not.toContain("hello")
    expect(result).not.toContain("{originalMessage}")
  })

  it("defaults to early when remainingMs is omitted", () => {
    const result = flavorSonChatMessage("hi", { random: () => 0 })
    expect(result).toBe(SON_CHAT_FLAVOR_EARLY[0]!.replace("{originalMessage}", "hi"))
  })

  it.each([
    ["early", SON_CHAT_FLAVOR_EARLY, FAMILY_PHOTO_DURATION_MS * 0.9],
    ["mid", SON_CHAT_FLAVOR_MID, FAMILY_PHOTO_DURATION_MS * 0.5],
    ["late", SON_CHAT_FLAVOR_LATE, FAMILY_PHOTO_DURATION_MS * 0.1],
  ] as const)("can reach every %s template via stubbed random", (_label, bank, remainingMs) => {
    for (let i = 0; i < bank.length; i++) {
      const result = flavorSonChatMessage("MSG", {
        remainingMs,
        random: () => (i + 0.5) / bank.length,
      })
      expect(result).toBe(bank[i]!.replaceAll("{originalMessage}", "MSG"))
      if (_label === "late") {
        expect(result).not.toContain("MSG")
      }
    }
  })
})
