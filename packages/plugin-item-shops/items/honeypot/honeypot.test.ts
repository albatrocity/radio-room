import type { ItemDefinition } from "@repo/types"
import { userFactory } from "@repo/factories"
import { describe, expect, it, vi } from "vitest"
import { boostPedal } from "../boost-pedal"
import {
  createMockDefinition,
  createMockDeps,
  invokeUse,
  stubRoomUsers,
} from "../shared/testHelpers"
import type { ItemShopsBehaviorDeps } from "../shared/types"
import { honeypot } from "./index"

describe("honeypot", () => {
  it("registers the expected shortId", () => {
    expect(honeypot.shortId).toBe("honeypot")
  })

  it("declares modifier defense for item-shops", () => {
    expect(honeypot.catalogEntry.definition.defense?.scope).toContain("modifier")
    expect(honeypot.catalogEntry.definition.defense?.targeting.sourcePlugins).toEqual([
      "item-shops",
    ])
    expect(typeof honeypot.onDefenseTriggered).toBe("function")
  })

  it("onDefenseTriggered awards a copy with defense_intercept source", async () => {
    const giveItem = vi.fn().mockResolvedValue({
      itemId: "new",
      definitionId: "item-shops:foo",
      sourcePlugin: "item-shops",
      quantity: 1,
      acquiredAt: 1,
    })
    const deps = {
      pluginName: "item-shops",
      context: {
        roomId: "room-1",
        inventory: { giveItem },
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
        getPresentedIdentity: vi.fn().mockResolvedValue(null),
      } as unknown as ItemShopsBehaviorDeps["game"],
    } as unknown as ItemShopsBehaviorDeps

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

    const defenseItemDefinition = {
      ...honeypot.catalogEntry.definition,
      id: "item-shops:honeypot",
      shortId: "honeypot",
      sourcePlugin: "item-shops",
    } as ItemDefinition

    await honeypot.onDefenseTriggered!(deps, {
      roomId: "room-1",
      defenderUserId: "def-1",
      attackerUserId: "atk-1",
      attackerItemDefinition,
      defenseItemDefinition,
    })

    expect(giveItem).toHaveBeenCalledWith(
      "def-1",
      "item-shops:foo",
      1,
      undefined,
      "defense_intercept",
    )
  })

  it("cross-user item use blocked by modifier defense consumes the attacker stack (core removes when consumed)", async () => {
    const deps = createMockDeps()
    const attacker = userFactory.build()
    const defender = userFactory.build({ userId: "defender-u1" })
    stubRoomUsers(deps, [attacker, defender])
    vi.mocked(deps.game.applyTimedModifier).mockResolvedValue({
      ok: false,
      reason: "defense_blocked",
      blockingItemName: "Honeypot",
      attackerMessage: "Honeypot intercepted your Boost Pedal.",
    })
    const def = createMockDefinition(boostPedal.shortId, {
      name: boostPedal.catalogEntry.definition.name,
      icon: boostPedal.catalogEntry.definition.icon,
    })

    const result = await invokeUse(boostPedal, deps, attacker.userId, def, {
      targetUserId: defender.userId,
    })

    expect(result.success).toBe(false)
    expect(result.consumed).toBe(true)
    expect(deps.game.applyTimedModifier).toHaveBeenCalledWith(
      defender.userId,
      expect.any(Number),
      expect.objectContaining({ itemDefinitionId: def.id }),
      attacker.userId,
    )
  })

  it("self-use is not intercepted by modifier defense (core skips when actor is target)", async () => {
    const deps = createMockDeps()
    const user = userFactory.build()
    stubRoomUsers(deps, [user])
    vi.mocked(deps.game.applyTimedModifier).mockResolvedValue({
      ok: true,
      modifierId: "mod-self",
    })
    const def = createMockDefinition(boostPedal.shortId, {
      name: boostPedal.catalogEntry.definition.name,
      icon: boostPedal.catalogEntry.definition.icon,
    })

    const result = await invokeUse(boostPedal, deps, user.userId, def, {
      targetUserId: user.userId,
    })

    expect(result.success).toBe(true)
    expect(result.consumed).toBe(true)
    expect(deps.game.applyTimedModifier).toHaveBeenCalledWith(
      user.userId,
      expect.any(Number),
      expect.objectContaining({ itemDefinitionId: def.id }),
      user.userId,
    )
  })
})
