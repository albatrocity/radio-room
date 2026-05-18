import { describe, expect, it, vi } from "vitest"
import type { AppContext, GameStateModifier, ItemDefinition } from "@repo/types"
import { DefenseService, modifierMatchesTargeting } from "./DefenseService"

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

describe("DefenseService.checkModifierDefense", () => {
  const defenseDefinition: ItemDefinition = {
    id: "item-shops:p2p-file-sharing",
    shortId: "p2p-file-sharing",
    sourcePlugin: "item-shops",
    name: "P2P File Sharing",
    description: "",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: false,
    coinValue: 30,
    icon: "Network",
    defense: {
      targeting: { sourcePlugins: ["item-shops"] },
      scope: ["modifier"],
    },
  }

  function createDefenseServiceWithInventory() {
    const removeItem = vi.fn().mockResolvedValue(true)
    const getItemDefinition = vi.fn().mockResolvedValue(defenseDefinition)
    const getInventory = vi.fn().mockResolvedValue({
      userId: "user-1",
      items: [
        {
          itemId: "def-stack-1",
          definitionId: defenseDefinition.id,
          sourcePlugin: "item-shops",
          quantity: 1,
          acquiredAt: 1,
        },
      ],
      maxSlots: 20,
    })
    const context = {
      inventory: { getInventory, getItemDefinition, removeItem },
    } as unknown as AppContext
    return { svc: new DefenseService(context), removeItem, getInventory }
  }

  it("returns null on self-use without consuming defense", async () => {
    const { svc, removeItem } = createDefenseServiceWithInventory()
    const incoming = {
      name: "boost",
      effects: [{ type: "flag" as const, name: "grow", value: true, intent: "positive" as const }],
      stackBehavior: "stack" as const,
      itemDefinitionId: "item-shops:boost-pedal",
    }

    const result = await svc.checkModifierDefense(
      "room-1",
      "user-1",
      "item-shops",
      incoming,
      "user-1",
    )

    expect(result).toBeNull()
    expect(removeItem).not.toHaveBeenCalled()
  })
})
