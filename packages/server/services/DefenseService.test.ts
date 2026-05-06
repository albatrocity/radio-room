import { describe, expect, it } from "vitest"
import type { GameStateModifier } from "@repo/types"
import { modifierMatchesTargeting } from "./DefenseService"

function mod(partial: Partial<GameStateModifier> & Pick<GameStateModifier, "effects">): GameStateModifier {
  return {
    id: "m1",
    name: "test",
    source: "item-shops",
    startAt: 0,
    endAt: 9999999999999,
    stackBehavior: "stack",
    ...partial,
  }
}

describe("modifierMatchesTargeting", () => {
  it("matches negative intent on any effect", () => {
    const m = mod({
      effects: [{ type: "flag", name: "echo", value: true, intent: "negative" }],
    })
    expect(modifierMatchesTargeting(m, { intents: ["negative"] })).toBe(true)
  })

  it("does not match when intent differs", () => {
    const m = mod({
      effects: [{ type: "flag", name: "grow", value: true, intent: "positive" }],
    })
    expect(modifierMatchesTargeting(m, { intents: ["negative"] })).toBe(false)
  })

  it("blocks entire modifier when source plugin matches and per-effect intent matches", () => {
    const m = mod({
      source: "item-shops",
      effects: [{ type: "flag", name: "x", value: true, intent: "negative" }],
    })
    expect(
      modifierMatchesTargeting(m, {
        sourcePlugins: ["item-shops"],
        intents: ["negative"],
      }),
    ).toBe(true)
  })

  it("fails source plugin filter", () => {
    const m = mod({
      source: "other",
      effects: [{ type: "flag", name: "x", value: true, intent: "negative" }],
    })
    expect(
      modifierMatchesTargeting(m, {
        sourcePlugins: ["item-shops"],
        intents: ["negative"],
      }),
    ).toBe(false)
  })

  it("blockAllModifiers skips effect checks", () => {
    const m = mod({
      source: "x",
      effects: [{ type: "multiplier", target: "score", value: 2 }],
    })
    expect(modifierMatchesTargeting(m, { blockAllModifiers: true })).toBe(true)
  })
})
