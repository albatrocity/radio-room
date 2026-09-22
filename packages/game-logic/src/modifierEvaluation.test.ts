import { describe, expect, it } from "vitest"
import { evaluateModifiers } from "./modifierEvaluation"
import type { GameStateModifier } from "@repo/types"

function lockCoinModifier(overrides?: Partial<GameStateModifier>): GameStateModifier {
  const now = Date.now()
  return {
    id: "m1",
    name: "Frozen Assets",
    source: "item-shops",
    effects: [{ type: "lock", target: "coin" }],
    startAt: now - 1000,
    endAt: now + 60_000,
    stackBehavior: "replace",
    ...overrides,
  }
}

describe("evaluateModifiers lock", () => {
  it("returns null for a credit when coin is locked", () => {
    expect(evaluateModifiers(10, "coin", [lockCoinModifier()], Date.now())).toBeNull()
  })

  it("returns null for a debit when coin is locked", () => {
    expect(evaluateModifiers(-5, "coin", [lockCoinModifier()], Date.now())).toBeNull()
  })

  it("does not lock other attributes", () => {
    expect(evaluateModifiers(10, "score", [lockCoinModifier()], Date.now())).toBe(10)
  })

  it("ignores expired locks", () => {
    const now = Date.now()
    const expired = lockCoinModifier({ startAt: now - 10_000, endAt: now - 1 })
    expect(evaluateModifiers(10, "coin", [expired], now)).toBe(10)
  })
})
