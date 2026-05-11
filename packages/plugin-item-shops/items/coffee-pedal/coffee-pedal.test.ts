import { describe, expect, it } from "vitest"
import { userFactory } from "@repo/factories"
import {
  createMockDefinition,
  createMockDeps,
  expectApplyTimedModifierForPedal,
  invokeUse,
  stubRoomUsers,
} from "../shared/testHelpers"
import { coffeePedal } from "."
import { COFFEE_FLAG } from "@repo/plugin-base"

describe("coffee-pedal", () => {
  it("registers the expected shortId", () => {
    expect(coffeePedal.shortId).toBe("coffee-pedal")
  })

  it("calls applyTimedModifier with interface blur flag", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build()
    stubRoomUsers(deps, [actor])
    const def = createMockDefinition(coffeePedal.shortId, {
      name: coffeePedal.catalogEntry.definition.name,
      icon: coffeePedal.catalogEntry.definition.icon,
    })

    const result = await invokeUse(coffeePedal, deps, actor.userId, def)

    expect(result.success).toBe(true)
    expectApplyTimedModifierForPedal(deps, actor.userId, {
      modifierName: "coffee",
      flag: COFFEE_FLAG,
      intent: "positive",
      durationMs: 300000,
    })
  })
})
