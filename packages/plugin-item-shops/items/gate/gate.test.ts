import { describe, expect, test } from "vitest"
import { userFactory } from "@repo/factories"
import { GATE_FLAG } from "@repo/plugin-base"
import { gate } from "./index"
import {
  createMockDefinition,
  createMockDeps,
  expectApplyTimedModifierForPedal,
  invokeUse,
  stubRoomUsers,
} from "../shared/testHelpers"

describe("gate", () => {
  test("calls applyTimedModifier with gate / gate flag", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build()
    stubRoomUsers(deps, [actor])
    const def = createMockDefinition(gate.shortId, {
      name: gate.catalogEntry.definition.name,
      icon: gate.catalogEntry.definition.icon,
    })

    const result = await invokeUse(gate, deps, actor.userId, def)

    expect(result.success).toBe(true)
    expectApplyTimedModifierForPedal(deps, actor.userId, {
      modifierName: "gate",
      flag: GATE_FLAG,
      intent: "negative",
    })
  })
})
