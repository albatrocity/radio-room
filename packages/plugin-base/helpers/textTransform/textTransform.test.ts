import { describe, expect, test } from "vitest"
import type { GameStateModifier } from "@repo/types"
import {
  GATE_FLAG,
  countTextEffectStacks,
} from "./flags"
import { applyGateTransform } from "./effects"
import { applyTextEffects } from "./pipeline"

describe("applyGateTransform", () => {
  test("replaces ASCII lowercase with Markdown-escaped underscores", () => {
    expect(applyGateTransform("hello")).toBe("\\_\\_\\_\\_\\_")
    expect(applyGateTransform("Hello")).toBe("H\\_\\_\\_\\_")
    expect(applyGateTransform("aBc123")).toBe("\\_B\\_123")
  })

  test("leaves punctuation and non-ASCII alone", () => {
    expect(applyGateTransform("café")).toBe("\\_\\_\\_é")
    expect(applyGateTransform("!!!")).toBe("!!!")
  })
})

describe("countTextEffectStacks gate", () => {
  test("counts gate flag stacks", () => {
    const now = 1000
    const modifiers: GameStateModifier[] = [
      {
        id: "m1",
        name: "g1",
        source: "test",
        stackBehavior: "stack",
        startAt: 0,
        endAt: 2000,
        effects: [{ type: "flag", name: GATE_FLAG, value: true }],
      },
      {
        id: "m2",
        name: "g2",
        source: "test",
        stackBehavior: "stack",
        startAt: 500,
        endAt: 1500,
        effects: [{ type: "flag", name: GATE_FLAG, value: true }],
      },
    ]
    expect(countTextEffectStacks(modifiers, now)).toEqual({
      shrink: 0,
      grow: 0,
      echo: 0,
      gate: 2,
    })
  })
})

describe("applyTextEffects gate", () => {
  test("gate-only returns masked content", () => {
    const result = applyTextEffects("Hello world", {
      shrink: 0,
      grow: 0,
      echo: 0,
      gate: 1,
    })
    expect(result).not.toBeNull()
    expect(result!.content).toBe("H\\_\\_\\_\\_ \\_\\_\\_\\_\\_")
    expect(result!.contentSegments.map((s) => s.text).join("")).toBe(
      "H\\_\\_\\_\\_ \\_\\_\\_\\_\\_",
    )
  })

  test("gate combines with echo on masked words", () => {
    const result = applyTextEffects("Hi", {
      shrink: 0,
      grow: 0,
      echo: 1,
      gate: 1,
    })
    expect(result!.content).toBe("H\\_ H\\_")
  })
})
