import { describe, expect, test, vi } from "vitest"
import { metadataSourceTrackFactory, queueItemFactory, userFactory } from "@repo/factories"
import { emptyFridge } from "./index"
import {
  createMockDefinition,
  createMockDeps,
  invokeUse,
  stubRoomUsers,
} from "../shared/testHelpers"

function stubQueueTarget(
  deps: ReturnType<typeof createMockDeps>,
  trackId: string,
  options?: { title?: string; addedBy?: ReturnType<typeof userFactory.build> },
) {
  const queueItem = queueItemFactory.build({
    track: metadataSourceTrackFactory.build({
      id: trackId,
      title: options?.title ?? "Target Track",
    }),
    addedBy: options?.addedBy,
  })
  vi.mocked(deps.context.api.getQueue).mockResolvedValue([queueItem])
  return queueItem
}

describe("emptyFridge", () => {
  test("demotes track with delta +1", async () => {
    const deps = createMockDeps()
    const user = userFactory.build()
    stubRoomUsers(deps, [user])
    stubQueueTarget(deps, "meta-track-2")

    const result = await invokeUse(
      emptyFridge,
      deps,
      user.userId,
      createMockDefinition("empty-fridge"),
      {
        targetQueueItemId: "meta-track-2",
      },
    )

    expect(result.success).toBe(true)
    expect(deps.context.api.moveTrackByPosition).toHaveBeenCalledWith(
      "room-1",
      "meta-track-2",
      1,
      user.userId,
    )
  })

  test("consumes item when defense_blocked", async () => {
    const deps = createMockDeps()
    const user = userFactory.build()
    stubRoomUsers(deps, [user])
    stubQueueTarget(deps, "meta-track-2")
    vi.mocked(deps.context.api.moveTrackByPosition).mockResolvedValue({
      success: false,
      reason: "defense_blocked",
      blockingItemName: "Catered Meal",
    })

    const result = await invokeUse(emptyFridge, deps, user.userId, createMockDefinition("empty-fridge"), {
      targetQueueItemId: "meta-track-2",
    })

    expect(result.success).toBe(false)
    expect(result.consumed).toBe(true)
    expect(result.message).toMatch(/Blocked by Catered Meal/)
    expect(result.message).toMatch(/lost with use/)
  })

  test("fails without targetQueueItemId", async () => {
    const deps = createMockDeps()
    const result = await invokeUse(emptyFridge, deps, "u1", createMockDefinition("empty-fridge"))
    expect(result.success).toBe(false)
    expect(result.message).toMatch(/Select a track/i)
  })

  test("fails when target track is not in queue", async () => {
    const deps = createMockDeps()
    const user = userFactory.build()
    stubRoomUsers(deps, [user])
    vi.mocked(deps.context.api.getQueue).mockResolvedValue([])

    const result = await invokeUse(emptyFridge, deps, user.userId, createMockDefinition("empty-fridge"), {
      targetQueueItemId: "missing-track",
    })

    expect(result.success).toBe(false)
    expect(result.consumed).toBe(false)
    expect(result.message).toBe("Targeted track not found in queue.")
    expect(deps.context.api.moveTrackByPosition).not.toHaveBeenCalled()
  })

  test("announces demotion with victim username and track title", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build({ username: "alice" })
    const victim = userFactory.build({ username: "bob" })
    stubRoomUsers(deps, [actor, victim])
    stubQueueTarget(deps, "meta-track-2", { title: "Bohemian Rhapsody", addedBy: victim })

    await invokeUse(emptyFridge, deps, actor.userId, createMockDefinition("empty-fridge"), {
      targetQueueItemId: "meta-track-2",
    })

    expect(deps.context.api.sendSystemMessage).toHaveBeenCalledWith(
      "room-1",
      'alice used Empty Fridge to demote bob\'s track, "Bohemian Rhapsody"!',
    )
  })

  test("announces demotion of own track", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build({ username: "alice" })
    stubRoomUsers(deps, [actor])
    stubQueueTarget(deps, "meta-track-2", { title: "My Song", addedBy: actor })

    await invokeUse(emptyFridge, deps, actor.userId, createMockDefinition("empty-fridge"), {
      targetQueueItemId: "meta-track-2",
    })

    expect(deps.context.api.sendSystemMessage).toHaveBeenCalledWith(
      "room-1",
      'alice used Empty Fridge to demote their own track, "My Song"!',
    )
  })

  test("announces demotion without queue adder", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build({ username: "alice" })
    stubRoomUsers(deps, [actor])
    stubQueueTarget(deps, "meta-track-2", { title: "Mystery Track", addedBy: undefined })

    await invokeUse(emptyFridge, deps, actor.userId, createMockDefinition("empty-fridge"), {
      targetQueueItemId: "meta-track-2",
    })

    expect(deps.context.api.sendSystemMessage).toHaveBeenCalledWith(
      "room-1",
      'alice used Empty Fridge to demote a track, "Mystery Track"!',
    )
  })
})
