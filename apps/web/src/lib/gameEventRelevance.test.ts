import { describe, expect, it } from "vitest"
import { isGameEventForUser } from "./gameEventRelevance"

describe("isGameEventForUser", () => {
  it("matches on userId", () => {
    expect(isGameEventForUser({ userId: "me" }, "me")).toBe(true)
    expect(isGameEventForUser({ userId: "other" }, "me")).toBe(false)
  })

  it("treats both sides of a transfer as relevant", () => {
    expect(isGameEventForUser({ fromUserId: "me", toUserId: "other" }, "me")).toBe(true)
    expect(isGameEventForUser({ fromUserId: "other", toUserId: "me" }, "me")).toBe(true)
    expect(isGameEventForUser({ fromUserId: "other", toUserId: "third" }, "me")).toBe(false)
  })

  it("fails open when the event or the viewer has no user", () => {
    expect(isGameEventForUser({}, "me")).toBe(true)
    expect(isGameEventForUser(undefined, "me")).toBe(true)
    expect(isGameEventForUser({ userId: "other" }, undefined)).toBe(true)
  })
})
