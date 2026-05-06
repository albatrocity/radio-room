import { describe, expect, test, vi } from "vitest"
import { userFactory } from "@repo/factories"
import { GROW_FLAG } from "@repo/plugin-base"
import { boostPedal } from "./index"
import {
  createMockDefinition,
  createMockDeps,
  expectApplyTimedModifierForPedal,
  invokeUse,
  stubRoomUsers,
} from "../shared/testHelpers"

describe("boostPedal", () => {
  test("calls applyTimedModifier with boost / grow flag", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build()
    stubRoomUsers(deps, [actor])
    const def = createMockDefinition(boostPedal.shortId, {
      name: boostPedal.catalogEntry.definition.name,
      icon: boostPedal.catalogEntry.definition.icon,
    })

    const result = await invokeUse(boostPedal, deps, actor.userId, def)

    expect(result.success).toBe(true)
    expectApplyTimedModifierForPedal(deps, actor.userId, {
      modifierName: "boost",
      flag: GROW_FLAG,
      intent: "positive",
    })
  })

  test("fails when target user is not in room", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build()
    const target = userFactory.build({ userId: "target-u1" })
    stubRoomUsers(deps, [actor])
    const def = createMockDefinition("boost-pedal")

    const result = await invokeUse(boostPedal, deps, actor.userId, def, {
      targetUserId: target.userId,
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain("not in this room")
    expect(deps.game.applyTimedModifier).not.toHaveBeenCalled()
  })

  test("reports defense_blocked", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build()
    stubRoomUsers(deps, [actor])
    vi.mocked(deps.game.applyTimedModifier).mockResolvedValue({
      ok: false,
      reason: "defense_blocked",
      blockingItemName: "Warranty",
    })
    const def = createMockDefinition("boost-pedal")

    const result = await invokeUse(boostPedal, deps, actor.userId, def)

    expect(result.success).toBe(false)
    expect(result.message).toContain("Warranty")
  })
})
