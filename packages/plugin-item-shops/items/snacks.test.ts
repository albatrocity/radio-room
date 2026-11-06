import { describe, expect, it, vi } from "vitest"
import { userFactory } from "@repo/factories"
import { applyTextEffects } from "@repo/plugin-base"
import { DOUBLE_VOTE_FLAG } from "@repo/game-logic"
import type { GameStateModifier } from "@repo/types"
import {
  createMockDefinition,
  createMockDeps,
  expectApplyTimedModifierForPedal,
  invokeUse,
  stubRoomUsers,
} from "./shared/testHelpers"
import { ITEM_CATALOG, TEXT_EFFECT_KINDS, items } from "./index"
import { SHOP_CATALOG } from "../shops"
import { COFFEE_CAPS_FLAG } from "./coffee"
import { MATCHA_FLAG } from "./matcha-latte"
import { NEAPOLITAN_FLAG } from "./neapolitan"
import { CRUNCH_FLAG } from "./potato-chips"
import { GROW_FLAG } from "./textEffects/flags"

const SNACKS = [
  items.coffee,
  items.matchaLatte,
  items.neapolitan,
  items.beefJerky,
  items.potatoChips,
  items.pizzaSlice,
  items.antacid,
]

function modifier(overrides: Partial<GameStateModifier>): GameStateModifier {
  return {
    id: "m",
    name: "m",
    source: "item-shops",
    stackBehavior: "stack",
    startAt: 0,
    endAt: Date.now() + 300_000,
    effects: [],
    ...overrides,
  }
}

describe("road trip snacks", () => {
  it("are in the catalog but in no catalog shop", () => {
    const catalogIds = new Set(ITEM_CATALOG.map((entry) => entry.definition.shortId))
    const listed = new Set(
      SHOP_CATALOG.flatMap((shop) => shop.availableItems.map((a) => a.shortId)),
    )
    for (const snack of SNACKS) {
      expect(catalogIds.has(snack.shortId)).toBe(true)
      expect(listed.has(snack.shortId)).toBe(false)
    }
  })

  it("Coffee shouts and stacks with Coffee Pedal", () => {
    const result = applyTextEffects(
      "buzz off",
      { [COFFEE_CAPS_FLAG]: 1, coffee: 1 },
      TEXT_EFFECT_KINDS,
    )
    expect(result?.content).toBe("BU!! OFF")
  })

  it("Matcha Latte turns every word green", () => {
    const result = applyTextEffects("hi there", { [MATCHA_FLAG]: 1 }, TEXT_EFFECT_KINDS)
    const words = result!.contentSegments.filter((s) => s.text.trim())
    expect(
      words.every((s) => s.effects?.some((e) => e.type === "color" && e.palette === "green")),
    ).toBe(true)
  })

  it("Neapolitan cycles yellow, brown, pink by word", () => {
    const result = applyTextEffects("a b c d", { [NEAPOLITAN_FLAG]: 1 }, TEXT_EFFECT_KINDS)
    const palettes = result!.contentSegments
      .filter((s) => s.text.trim())
      .map((s) => s.effects?.find((e) => e.type === "color"))
      .map((e) => (e?.type === "color" ? e.palette : undefined))
    expect(palettes).toEqual(["yellow", "brown", "pink", "yellow"])
  })

  it("Potato Chips makes every other letter large, the same way every time", () => {
    const run = () => applyTextEffects("crunch", { [CRUNCH_FLAG]: 1 }, TEXT_EFFECT_KINDS)
    const sizes = run()!.contentSegments.map(
      (s) => s.effects?.find((e) => e.type === "size")?.value,
    )
    expect(sizes).toEqual([undefined, "lg", undefined, "lg", undefined, "lg"])
    expect(run()).toEqual(run())
  })

  it("Beef Jerky grows text", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build()
    stubRoomUsers(deps, [actor])
    const def = createMockDefinition(items.beefJerky.shortId, {
      name: items.beefJerky.catalogEntry.definition.name,
      icon: items.beefJerky.catalogEntry.definition.icon,
    })
    const result = await invokeUse(items.beefJerky, deps, actor.userId, def)
    expect(result.success).toBe(true)
    expectApplyTimedModifierForPedal(deps, actor.userId, {
      modifierName: "beef-jerky",
      flag: GROW_FLAG,
      intent: "positive",
      durationMs: 600_000,
    })
  })

  describe("Antacid", () => {
    it("removes only the newest negative effect", async () => {
      const deps = createMockDeps()
      const actor = userFactory.build()
      stubRoomUsers(deps, [actor])
      vi.mocked(deps.game.getUserState).mockResolvedValue({
        userId: actor.userId,
        attributes: { score: 0, coin: 0 },
        modifiers: [
          modifier({
            id: "old",
            startAt: 1,
            effects: [{ type: "flag", name: "gate", value: true, intent: "negative" }],
          }),
          modifier({
            id: "new",
            startAt: 5,
            effects: [{ type: "flag", name: "shrink", value: true, intent: "negative" }],
          }),
          modifier({
            id: "good",
            startAt: 9,
            effects: [{ type: "flag", name: "grow", value: true, intent: "positive" }],
          }),
        ],
      })
      const result = await invokeUse(
        items.antacid,
        deps,
        actor.userId,
        createMockDefinition("antacid", { name: "Antacid" }),
      )
      expect(result).toMatchObject({ success: true, consumed: true })
      expect(deps.game.removeModifier).toHaveBeenCalledTimes(1)
      expect(deps.game.removeModifier).toHaveBeenCalledWith(actor.userId, "new")
    })

    it("is kept when nothing is wrong", async () => {
      const deps = createMockDeps()
      const actor = userFactory.build()
      stubRoomUsers(deps, [actor])
      vi.mocked(deps.game.getUserState).mockResolvedValue({
        userId: actor.userId,
        attributes: { score: 0, coin: 0 },
        modifiers: [],
      })
      const result = await invokeUse(
        items.antacid,
        deps,
        actor.userId,
        createMockDefinition("antacid"),
      )
      expect(result).toMatchObject({ success: false, consumed: false })
    })
  })

  describe("Pizza Slice", () => {
    it("applies a double-vote charge", async () => {
      const deps = createMockDeps()
      const actor = userFactory.build()
      stubRoomUsers(deps, [actor])
      vi.mocked(deps.game.getUserState).mockResolvedValue({
        userId: actor.userId,
        attributes: { score: 0, coin: 0 },
        modifiers: [],
      })
      const result = await invokeUse(
        items.pizzaSlice,
        deps,
        actor.userId,
        createMockDefinition("pizza-slice", { name: "Pizza Slice" }),
      )
      expect(result).toMatchObject({ success: true, consumed: true })
      expect(deps.game.applyTimedModifier).toHaveBeenCalledWith(
        actor.userId,
        expect.any(Number),
        expect.objectContaining({
          effects: [expect.objectContaining({ type: "flag", name: DOUBLE_VOTE_FLAG })],
        }),
        actor.userId,
      )
    })

    it("refuses while a charge is already waiting", async () => {
      const deps = createMockDeps()
      const actor = userFactory.build()
      stubRoomUsers(deps, [actor])
      vi.mocked(deps.game.getUserState).mockResolvedValue({
        userId: actor.userId,
        attributes: { score: 0, coin: 0 },
        modifiers: [modifier({ effects: [{ type: "flag", name: DOUBLE_VOTE_FLAG, value: true }] })],
      })
      const result = await invokeUse(
        items.pizzaSlice,
        deps,
        actor.userId,
        createMockDefinition("pizza-slice"),
      )
      expect(result).toMatchObject({ success: false, consumed: false })
      expect(deps.game.applyTimedModifier).not.toHaveBeenCalled()
    })
  })
})
