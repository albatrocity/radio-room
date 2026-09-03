import { describe, expect, it } from "vitest"
import { chatDisplayUser } from "./chatDisplayUser"
import type { ChatMessage } from "../types/ChatMessage"
import type { User } from "../types/User"

const message = (user: User): ChatMessage => ({
  content: "hi",
  timestamp: "2026-09-03T00:00:00.000Z",
  user,
})

describe("chatDisplayUser", () => {
  it("returns the same reference while the listener entry is unchanged", () => {
    const msg = message({ userId: "u1", username: "Somebody" })
    const listener: User = { userId: "u1", username: "ross", status: "listening" }

    const first = chatDisplayUser(msg, listener)
    expect(chatDisplayUser(msg, listener)).toBe(first)
  })

  it("keeps the baked username and icon over the live listener values", () => {
    const msg = message({ userId: "u1", username: "Somebody", usernameIcon: "mask" })
    const listener: User = {
      userId: "u1",
      username: "ross",
      usernameIcon: "star",
      personas: [],
    }

    const displayUser = chatDisplayUser(msg, listener)
    expect(displayUser.username).toBe("Somebody")
    expect(displayUser.usernameIcon).toBe("mask")
    expect(displayUser.personas).toEqual([])
  })

  it("re-merges when the listener entry changes", () => {
    const msg = message({ userId: "u1", username: "ross" })
    const first = chatDisplayUser(msg, { userId: "u1", status: "listening" })
    const second = chatDisplayUser(msg, { userId: "u1", status: "participating" })

    expect(second).not.toBe(first)
    expect(second.status).toBe("participating")
  })

  it("falls back to the message user when the author is not a listener", () => {
    const msg = message({ userId: "u1", username: "ross" })
    expect(chatDisplayUser(msg, undefined)).toBe(msg.user)
  })
})
