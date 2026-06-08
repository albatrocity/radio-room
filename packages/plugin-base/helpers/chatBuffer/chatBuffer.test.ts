import { describe, expect, test } from "vitest"
import type { GameStateModifier } from "@repo/types"
import { CHAT_BUFFER_FLAG, countChatBufferStacks, getChatSendDelayMs } from "./index"

describe("countChatBufferStacks", () => {
  const now = 1_700_000_000_000

  test("counts one stack per active modifier with chat_buffer flag", () => {
    const modifiers: GameStateModifier[] = [
      {
        id: "a",
        name: "buffer_pedal",
        source: "item-shops",
        stackBehavior: "stack",
        startAt: now - 1000,
        endAt: now + 300_000,
        effects: [{ type: "flag", name: CHAT_BUFFER_FLAG, value: true, intent: "negative" }],
      },
      {
        id: "b",
        name: "buffer_pedal",
        source: "item-shops",
        stackBehavior: "stack",
        startAt: now - 1000,
        endAt: now + 300_000,
        effects: [{ type: "flag", name: CHAT_BUFFER_FLAG, value: true, intent: "negative" }],
      },
    ]

    expect(countChatBufferStacks(modifiers, now)).toBe(2)
    expect(getChatSendDelayMs(modifiers, now)).toBe(2000)
  })

  test("ignores expired modifiers", () => {
    const modifiers: GameStateModifier[] = [
      {
        id: "expired",
        name: "buffer_pedal",
        source: "item-shops",
        stackBehavior: "stack",
        startAt: now - 10_000,
        endAt: now - 1,
        effects: [{ type: "flag", name: CHAT_BUFFER_FLAG, value: true, intent: "negative" }],
      },
    ]

    expect(countChatBufferStacks(modifiers, now)).toBe(0)
    expect(getChatSendDelayMs(modifiers, now)).toBe(0)
  })
})
