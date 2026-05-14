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
import { p2pFileSharing } from "./index"

describe("p2p-file-sharing", () => {
  it("registers the expected shortId", () => {
    expect(p2pFileSharing.shortId).toBe("p2p-file-sharing")
  })

  it("declares modifier defense for item-shops", () => {
    expect(p2pFileSharing.catalogEntry.definition.defense?.scope).toContain("modifier")
    expect(p2pFileSharing.catalogEntry.definition.defense?.targeting.sourcePlugins).toEqual([
      "item-shops",
    ])
    expect(typeof p2pFileSharing.onDefenseTriggered).toBe("function")
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
      ...p2pFileSharing.catalogEntry.definition,
      id: "item-shops:p2p-file-sharing",
      shortId: "p2p-file-sharing",
      sourcePlugin: "item-shops",
    } as ItemDefinition

    await p2pFileSharing.onDefenseTriggered!(deps, {
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
      blockingItemName: "P2P File Sharing",
      attackerMessage: "P2P File Sharing intercepted your Boost Pedal.",
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
})
