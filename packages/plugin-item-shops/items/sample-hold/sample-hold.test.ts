import { describe, expect, test } from "vitest"
import { userFactory } from "@repo/factories"
import { sampleHold } from "./index"
import {
  createMockDefinition,
  createMockDeps,
  expectApplyTimedModifierForPedal,
  invokeUse,
  stubRoomUsers,
} from "../shared/testHelpers"

describe("sampleHold", () => {
  test("calls applyTimedModifier with sample-hold / scramble flag", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build()
    stubRoomUsers(deps, [actor])
    const def = createMockDefinition(sampleHold.shortId, {
      name: sampleHold.catalogEntry.definition.name,
      icon: sampleHold.catalogEntry.definition.icon,
    })

    const result = await invokeUse(sampleHold, deps, actor.userId, def)

    expect(result.success).toBe(true)
    expectApplyTimedModifierForPedal(deps, actor.userId, {
      modifierName: "sample-hold",
      flag: "scramble",
      intent: "negative",
      durationMs: 300_000,
    })
  })
})
