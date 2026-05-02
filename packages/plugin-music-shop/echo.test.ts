import { describe, expect, it } from "vitest"
import { buildSegments, tokenizeWords } from "@repo/plugin-base"
import { getActiveFlags } from "@repo/types"
import type { GameStateModifier } from "@repo/types"

describe("music-shop echo chat transform", () => {
  it("produces doubled words for typical chat text", () => {
    const tokens = tokenizeWords("Hello everyone!")
    const { content } = buildSegments(tokens, (t) =>
      t.word
        ? [
            { text: t.word },
            { text: ` ${t.word}`, effects: [{ type: "size", value: "small" }] },
          ]
        : [],
    )
    expect(content).toBe("Hello Hello everyone! everyone!")
  })
})

describe("getActiveFlags", () => {
  it("returns echo when flag modifier is active", () => {
    const now = Date.now()
    const modifiers: GameStateModifier[] = [
      {
        id: "m1",
        name: "analog_delay_echo",
        source: "music-shop",
        effects: [{ type: "flag", name: "echo", value: true }],
        startAt: now - 1000,
        endAt: now + 60_000,
        stackBehavior: "extend",
      },
    ]
    expect(getActiveFlags(modifiers, now).echo).toBe(true)
  })

  it("ignores expired modifiers", () => {
    const now = Date.now()
    const modifiers: GameStateModifier[] = [
      {
        id: "m1",
        name: "x",
        source: "music-shop",
        effects: [{ type: "flag", name: "echo", value: true }],
        startAt: now - 10_000,
        endAt: now - 1,
        stackBehavior: "replace",
      },
    ]
    expect(getActiveFlags(modifiers, now).echo).toBeUndefined()
  })
})
