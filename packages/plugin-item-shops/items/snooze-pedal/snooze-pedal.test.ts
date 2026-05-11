import { describe, expect, it } from "vitest"
import { userFactory } from "@repo/factories"
import {
  createMockDefinition,
  createMockDeps,
  expectApplyTimedModifierForPedal,
  invokeUse,
  stubRoomUsers,
} from "../shared/testHelpers"
import { SNOOZE_FLAG } from "../textEffects/textEffectFlags"
import { snoozePedal } from "."

describe("snooze-pedal", () => {
  it("registers the expected shortId", () => {
    expect(snoozePedal.shortId).toBe("snooze-pedal")
  })

  it("calls applyTimedModifier with interface blur flag", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build()
    stubRoomUsers(deps, [actor])
    const def = createMockDefinition(snoozePedal.shortId, {
      name: snoozePedal.catalogEntry.definition.name,
      icon: snoozePedal.catalogEntry.definition.icon,
    })

    const result = await invokeUse(snoozePedal, deps, actor.userId, def)

    expect(result.success).toBe(true)
    expectApplyTimedModifierForPedal(deps, actor.userId, {
      modifierName: "snooze-pedal",
      flag: SNOOZE_FLAG,
      intent: "negative",
      durationMs: 300000,
    })
  })
})
