import { describe, expect, test } from "vitest"
import { userFactory } from "@repo/factories"
import { ECHO_FLAG } from "@repo/plugin-base"
import { analogDelayPedal } from "./index"
import {
  createMockDefinition,
  createMockDeps,
  expectApplyTimedModifierForPedal,
  invokeUse,
  stubRoomUsers,
} from "../shared/testHelpers"

describe("analogDelayPedal", () => {
  test("calls applyTimedModifier with analog_delay_echo / echo flag", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build()
    stubRoomUsers(deps, [actor])
    const def = createMockDefinition(analogDelayPedal.shortId, {
      name: analogDelayPedal.catalogEntry.definition.name,
      icon: analogDelayPedal.catalogEntry.definition.icon,
    })

    const result = await invokeUse(analogDelayPedal, deps, actor.userId, def)

    expect(result.success).toBe(true)
    expectApplyTimedModifierForPedal(deps, actor.userId, {
      modifierName: "analog_delay_echo",
      flag: ECHO_FLAG,
      intent: "negative",
    })
  })
})
