import { describe, expect, test, vi } from "vitest"
import { userFactory } from "@repo/factories"
import { INTERFACE_BLUR_FLAG } from "@repo/plugin-base"
import { fuzzPedal } from "./index"
import {
  createMockDefinition,
  createMockDeps,
  expectApplyTimedModifierForPedal,
  invokeUse,
  stubRoomUsers,
} from "../shared/testHelpers"

describe("fuzzPedal", () => {
  test("calls applyTimedModifier with interface blur flag", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build()
    stubRoomUsers(deps, [actor])
    const def = createMockDefinition(fuzzPedal.shortId, {
      name: fuzzPedal.catalogEntry.definition.name,
      icon: fuzzPedal.catalogEntry.definition.icon,
    })

    const result = await invokeUse(fuzzPedal, deps, actor.userId, def)

    expect(result.success).toBe(true)
    expectApplyTimedModifierForPedal(deps, actor.userId, {
      modifierName: "interface_blur",
      flag: INTERFACE_BLUR_FLAG,
      intent: "negative",
    })
  })

  test("fails when target user is not in room", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build()
    const target = userFactory.build({ userId: "target-u1" })
    stubRoomUsers(deps, [actor])
    const def = createMockDefinition("fuzz-pedal")

    const result = await invokeUse(fuzzPedal, deps, actor.userId, def, {
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
    const def = createMockDefinition("fuzz-pedal")

    const result = await invokeUse(fuzzPedal, deps, actor.userId, def)

    expect(result.success).toBe(false)
    expect(result.message).toContain("Warranty")
  })
})
