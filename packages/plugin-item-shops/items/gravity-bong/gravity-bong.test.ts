import { describe, expect, it } from "vitest"
import { gravityBong } from "."
import {
  createMockDefinition,
  createMockDeps,
  invokeUse,
  stubRoomUsers,
} from "../shared/testHelpers"
import { userFactory } from "@repo/factories"

describe("gravity-bong", () => {
  it("registers the expected shortId", () => {
    expect(gravityBong.shortId).toBe("gravity-bong")
  })

  it("shuffles the queue", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build()
    stubRoomUsers(deps, [actor])
    const def = createMockDefinition(gravityBong.shortId, {
      name: gravityBong.catalogEntry.definition.name,
      icon: gravityBong.catalogEntry.definition.icon,
    })

    const result = await invokeUse(gravityBong, deps, actor.userId, def)

    expect(deps.context.api.shuffleTrackQueue).toHaveBeenCalledWith(deps.context.roomId)

    expect(result.success).toBe(true)
    expect(result.consumed).toBe(true)
    expect(result.message).toBe("Queue shuffled!")
  })
})
