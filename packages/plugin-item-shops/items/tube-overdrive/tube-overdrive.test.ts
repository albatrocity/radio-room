import { describe, expect, test, vi } from "vitest"
import { userFactory } from "@repo/factories"
import { INTERFACE_SATURATE_FLAG } from "@repo/plugin-base"
import { tubeOverdrive } from "./index"
import {
  createMockDefinition,
  createMockDeps,
  expectApplyTimedModifierForPedal,
  invokeUse,
  stubRoomUsers,
} from "../shared/testHelpers"

describe("tubeOverdrive", () => {
  test("calls applyTimedModifier with interface saturate flag", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build()
    stubRoomUsers(deps, [actor])
    const def = createMockDefinition(tubeOverdrive.shortId, {
      name: tubeOverdrive.catalogEntry.definition.name,
      icon: tubeOverdrive.catalogEntry.definition.icon,
    })

    const result = await invokeUse(tubeOverdrive, deps, actor.userId, def)

    expect(result.success).toBe(true)
    expectApplyTimedModifierForPedal(deps, actor.userId, {
      modifierName: "interface_saturate",
      flag: INTERFACE_SATURATE_FLAG,
      intent: "positive",
      durationMs: 30000,
    })
  })

  test("fails when target user is not in room", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build()
    const target = userFactory.build({ userId: "target-u1" })
    stubRoomUsers(deps, [actor])
    const def = createMockDefinition("tube-overdrive")

    const result = await invokeUse(tubeOverdrive, deps, actor.userId, def, {
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
    const def = createMockDefinition("tube-overdrive")

    const result = await invokeUse(tubeOverdrive, deps, actor.userId, def)

    expect(result.success).toBe(false)
    expect(result.message).toContain("Warranty")
  })
})
