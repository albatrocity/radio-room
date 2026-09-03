import { describe, expect, it } from "vitest"
import { userFactory } from "@repo/factories"
import { INVENTORY_PEEK_FLAG } from "@repo/plugin-base"
import {
  createMockDefinition,
  createMockDeps,
  expectApplyTimedModifierForPedal,
  invokeUse,
  stubRoomUsers,
} from "../shared/testHelpers"
import { xRay } from "./index"

describe("xRay", () => {
  it("registers the expected shortId", () => {
    expect(xRay.shortId).toBe("x-ray")
  })

  it("applies inventory_peek flag for 5 minutes without a room announce", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build()
    stubRoomUsers(deps, [actor])
    const def = createMockDefinition(xRay.shortId, {
      name: xRay.catalogEntry.definition.name,
      icon: xRay.catalogEntry.definition.icon,
    })

    const result = await invokeUse(xRay, deps, actor.userId, def)

    expect(result.success).toBe(true)
    expect(result.consumed).toBe(true)
    expectApplyTimedModifierForPedal(deps, actor.userId, {
      modifierName: "x-ray",
      flag: INVENTORY_PEEK_FLAG,
      intent: "neutral",
      durationMs: 5 * 60 * 1000,
      visibility: "self",
    })
    expect(deps.context.api.sendSystemMessage).not.toHaveBeenCalled()
  })
})
