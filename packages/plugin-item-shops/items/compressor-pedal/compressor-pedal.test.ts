import { describe, expect, test } from "vitest"
import { userFactory } from "@repo/factories"
import { SHRINK_FLAG } from "@repo/plugin-base"
import { compressorPedal } from "./index"
import {
  createMockDefinition,
  createMockDeps,
  expectApplyTimedModifierForPedal,
  invokeUse,
  stubRoomUsers,
} from "../shared/testHelpers"

describe("compressorPedal", () => {
  test("calls applyTimedModifier with compressor / shrink flag", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build()
    stubRoomUsers(deps, [actor])
    const def = createMockDefinition(compressorPedal.shortId, {
      name: compressorPedal.catalogEntry.definition.name,
      icon: compressorPedal.catalogEntry.definition.icon,
    })

    const result = await invokeUse(compressorPedal, deps, actor.userId, def)

    expect(result.success).toBe(true)
    expectApplyTimedModifierForPedal(deps, actor.userId, {
      modifierName: "compressor",
      flag: SHRINK_FLAG,
      intent: "negative",
    })
  })
})
