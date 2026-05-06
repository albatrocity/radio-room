import { describe, expect, test } from "vitest"
import { userFactory } from "@repo/factories"
import { emptyFridge } from "./index"
import { createMockDefinition, createMockDeps, invokeUse, stubRoomUsers } from "../shared/testHelpers"

describe("emptyFridge", () => {
  test("demotes track with delta +1", async () => {
    const deps = createMockDeps()
    const user = userFactory.build()
    stubRoomUsers(deps, [user])

    const result = await invokeUse(emptyFridge, deps, user.userId, createMockDefinition("empty-fridge"), {
      targetQueueItemId: "meta-track-2",
    })

    expect(result.success).toBe(true)
    expect(deps.context.api.moveTrackByPosition).toHaveBeenCalledWith(
      "room-1",
      "meta-track-2",
      1,
      user.userId,
    )
  })

  test("fails without targetQueueItemId", async () => {
    const deps = createMockDeps()
    const result = await invokeUse(emptyFridge, deps, "u1", createMockDefinition("empty-fridge"))
    expect(result.success).toBe(false)
    expect(result.message).toMatch(/Select a track/i)
  })
})
