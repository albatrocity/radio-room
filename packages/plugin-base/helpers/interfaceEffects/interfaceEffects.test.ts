import { describe, expect, test } from "vitest"
import type { GameStateModifier } from "@repo/types"
import {
  INTERFACE_BLUR_FLAG,
  INTERFACE_SATURATE_FLAG,
  countInterfaceBlurStacks,
  countInterfaceSaturateStacks,
} from "./index"

describe("countInterfaceBlurStacks", () => {
  test("counts one stack per active modifier with blur flag", () => {
    const now = 1000
    const modifiers: GameStateModifier[] = [
      {
        id: "b1",
        name: "blur1",
        source: "test",
        stackBehavior: "stack",
        startAt: 0,
        endAt: 2000,
        effects: [{ type: "flag", name: INTERFACE_BLUR_FLAG, value: true }],
      },
      {
        id: "b2",
        name: "blur2",
        source: "test",
        stackBehavior: "stack",
        startAt: 500,
        endAt: 1500,
        effects: [{ type: "flag", name: INTERFACE_BLUR_FLAG, value: true }],
      },
    ]
    expect(countInterfaceBlurStacks(modifiers, now)).toBe(2)
  })

  test("ignores expired modifiers and false flag values", () => {
    const now = 3000
    const modifiers: GameStateModifier[] = [
      {
        id: "expired",
        name: "blur-expired",
        source: "test",
        stackBehavior: "stack",
        startAt: 0,
        endAt: 2000,
        effects: [{ type: "flag", name: INTERFACE_BLUR_FLAG, value: true }],
      },
      {
        id: "off",
        name: "blur-off",
        source: "test",
        stackBehavior: "stack",
        startAt: 0,
        endAt: 5000,
        effects: [{ type: "flag", name: INTERFACE_BLUR_FLAG, value: false }],
      },
    ]
    expect(countInterfaceBlurStacks(modifiers, now)).toBe(0)
  })
})

describe("countInterfaceSaturateStacks", () => {
  test("counts one stack per active modifier with saturate flag", () => {
    const now = 1000
    const modifiers: GameStateModifier[] = [
      {
        id: "s1",
        name: "sat1",
        source: "test",
        stackBehavior: "stack",
        startAt: 0,
        endAt: 2000,
        effects: [{ type: "flag", name: INTERFACE_SATURATE_FLAG, value: true }],
      },
      {
        id: "s2",
        name: "sat2",
        source: "test",
        stackBehavior: "stack",
        startAt: 500,
        endAt: 1500,
        effects: [{ type: "flag", name: INTERFACE_SATURATE_FLAG, value: true }],
      },
    ]
    expect(countInterfaceSaturateStacks(modifiers, now)).toBe(2)
  })

  test("ignores expired modifiers and false flag values", () => {
    const now = 3000
    const modifiers: GameStateModifier[] = [
      {
        id: "expired",
        name: "sat-expired",
        source: "test",
        stackBehavior: "stack",
        startAt: 0,
        endAt: 2000,
        effects: [{ type: "flag", name: INTERFACE_SATURATE_FLAG, value: true }],
      },
      {
        id: "off",
        name: "sat-off",
        source: "test",
        stackBehavior: "stack",
        startAt: 0,
        endAt: 5000,
        effects: [{ type: "flag", name: INTERFACE_SATURATE_FLAG, value: false }],
      },
    ]
    expect(countInterfaceSaturateStacks(modifiers, now)).toBe(0)
  })
})
