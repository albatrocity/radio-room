import type { ItemDefinition } from "@repo/types"
import { describe, expect, it, vi } from "vitest"
import type { ItemShopsBehaviorDeps } from "../shared/types"
import { rubberBand } from "./index"

describe("rubber-band", () => {
  it("registers the expected shortId", () => {
    expect(rubberBand.shortId).toBe("rubber-band")
  })

  it("declares modifier defense for item-shops", () => {
    expect(rubberBand.catalogEntry.definition.defense?.scope).toContain("modifier")
    expect(rubberBand.catalogEntry.definition.defense?.targeting.sourcePlugins).toEqual([
      "item-shops",
    ])
    expect(typeof rubberBand.onDefenseTriggered).toBe("function")
  })

  it("onDefenseTriggered redirects blocked modifier onto attacker via reboundModifier", async () => {
    const reboundModifier = vi.fn().mockResolvedValue({ ok: true, modifierId: "m1" })
    const deps = {
      pluginName: "item-shops",
      context: {
        roomId: "room-1",
        api: {
          getUsersByIds: vi
            .fn()
            .mockImplementation(async (ids: string[]) =>
              ids.map((id) =>
                id === "atk-1"
                  ? { username: "Attacker" }
                  : id === "def-1"
                    ? { username: "Defender" }
                    : { username: id },
              ),
            ),
        },
      },
      game: {
        getUserState: vi.fn().mockResolvedValue(null),
        reboundModifier,
      } as unknown as ItemShopsBehaviorDeps["game"],
    } as unknown as ItemShopsBehaviorDeps

    const defenseItemDefinition = {
      ...rubberBand.catalogEntry.definition,
      id: "item-shops:rubber-band",
      shortId: "rubber-band",
      sourcePlugin: "item-shops",
    } as ItemDefinition

    const attackerItemDefinition = {
      id: "item-shops:foo",
      shortId: "foo",
      name: "Foo",
      description: "",
      stackable: true,
      maxStack: 3,
      tradeable: true,
      consumable: true,
      sourcePlugin: "item-shops",
    } as ItemDefinition

    const blockedModifier = {
      name: "boost",
      effects: [
        { type: "flag" as const, name: "grow", value: true, intent: "positive" as const },
      ],
      startAt: 1_000,
      endAt: 1_000 + 120_000,
      stackBehavior: "stack" as const,
      itemDefinitionId: "item-shops:foo",
    }

    await rubberBand.onDefenseTriggered!(deps, {
      roomId: "room-1",
      defenderUserId: "def-1",
      attackerUserId: "atk-1",
      attackerItemDefinition,
      defenseItemDefinition,
      blockedModifier,
    })

    expect(reboundModifier).toHaveBeenCalledWith("atk-1", blockedModifier, {
      actorUserId: "atk-1",
    })
  })
})
