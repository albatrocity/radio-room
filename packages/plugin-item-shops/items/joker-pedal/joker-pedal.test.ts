import { describe, expect, test } from "vitest"
import { userFactory } from "@repo/factories"
import { COMIC_SANS_FLAG } from "@repo/plugin-base"
import { jokerPedal } from "./index"
import {
  createMockDefinition,
  createMockDeps,
  expectApplyTimedModifierForPedal,
  invokeUse,
  stubRoomUsers,
} from "../shared/testHelpers"

describe("jokerPedal", () => {
  test("calls applyTimedModifier with joker_pedal / comic sans flag", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build()
    stubRoomUsers(deps, [actor])
    const def = createMockDefinition(jokerPedal.shortId, {
      name: jokerPedal.catalogEntry.definition.name,
      icon: jokerPedal.catalogEntry.definition.icon,
    })

    const result = await invokeUse(jokerPedal, deps, actor.userId, def)

    expect(result.success).toBe(true)
    expectApplyTimedModifierForPedal(deps, actor.userId, {
      modifierName: "joker_pedal",
      flag: COMIC_SANS_FLAG,
      intent: "negative",
    })
  })
})
