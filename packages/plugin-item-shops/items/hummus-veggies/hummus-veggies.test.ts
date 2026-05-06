import { describe, expect, test, vi } from "vitest"
import { userFactory } from "@repo/factories"
import { hummusVeggies } from "./index"
import {
  createMockDefinition,
  createMockDeps,
  invokeUse,
  stubRoomUsers,
} from "../shared/testHelpers"

describe("hummusVeggies", () => {
  test("promotes track with delta -1", async () => {
    const deps = createMockDeps()
    const user = userFactory.build()
    stubRoomUsers(deps, [user])
    const def = createMockDefinition("hummus-veggies")

    const result = await invokeUse(hummusVeggies, deps, user.userId, def, {
      targetQueueItemId: "meta-track-1",
    })

    expect(result.success).toBe(true)
    expect(deps.context.api.moveTrackByPosition).toHaveBeenCalledWith(
      "room-1",
      "meta-track-1",
      -1,
      user.userId,
    )
  })

  test("fails without targetQueueItemId", async () => {
    const deps = createMockDeps()
    const result = await invokeUse(hummusVeggies, deps, "u1", createMockDefinition("hummus-veggies"))
    expect(result.success).toBe(false)
    expect(result.message).toMatch(/Select a track/i)
  })

  test("propagates move failure", async () => {
    const deps = createMockDeps()
    const user = userFactory.build()
    stubRoomUsers(deps, [user])
    vi.mocked(deps.context.api.moveTrackByPosition).mockResolvedValue({
      success: false,
      message: "Cannot move",
    })

    const result = await invokeUse(hummusVeggies, deps, user.userId, createMockDefinition("hummus-veggies"), {
      targetQueueItemId: "q1",
    })

    expect(result.success).toBe(false)
    expect(result.message).toBe("Cannot move")
  })
})
