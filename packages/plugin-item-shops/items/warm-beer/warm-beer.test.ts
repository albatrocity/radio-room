import { describe, expect, test, vi } from "vitest"
import { metadataSourceTrackFactory, queueItemFactory, userFactory } from "@repo/factories"
import { warmBeer } from "./index"
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

describe("warmBeer", () => {
  test("promotes track with delta -1", async () => {
    const deps = createMockDeps()
    const user = userFactory.build()
    stubRoomUsers(deps, [user])
    stubQueueTarget(deps, "meta-track-1")
    const def = createMockDefinition("warm-beer")

    const result = await invokeUse(warmBeer, deps, user.userId, def, {
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
    const result = await invokeUse(warmBeer, deps, "u1", createMockDefinition("warm-beer"))
    expect(result.success).toBe(false)
    expect(result.message).toMatch(/Select a track/i)
  })

  test("fails when target track is not in queue", async () => {
    const deps = createMockDeps()
    const user = userFactory.build()
    stubRoomUsers(deps, [user])
    vi.mocked(deps.context.api.getQueue).mockResolvedValue([])

    const result = await invokeUse(warmBeer, deps, user.userId, createMockDefinition("warm-beer"), {
      targetQueueItemId: "missing-track",
    })

    expect(result.success).toBe(false)
    expect(result.consumed).toBe(false)
    expect(result.message).toBe("Targeted track not found in queue.")
    expect(deps.context.api.moveTrackByPosition).not.toHaveBeenCalled()
  })

  test("consumes item when defense_blocked", async () => {
    const deps = createMockDeps()
    const user = userFactory.build()
    stubRoomUsers(deps, [user])
    stubQueueTarget(deps, "q1")
    vi.mocked(deps.context.api.moveTrackByPosition).mockResolvedValue({
      success: false,
      reason: "defense_blocked",
      blockingItemName: "Catered Meal",
    })

    const result = await invokeUse(warmBeer, deps, user.userId, createMockDefinition("warm-beer"), {
      targetQueueItemId: "q1",
    })

    expect(result.success).toBe(false)
    expect(result.consumed).toBe(true)
    expect(result.message).toMatch(/Blocked by Catered Meal/)
    expect(result.message).toMatch(/lost with use/)
  })

  test("propagates move failure", async () => {
    const deps = createMockDeps()
    const user = userFactory.build()
    stubRoomUsers(deps, [user])
    stubQueueTarget(deps, "q1")
    vi.mocked(deps.context.api.moveTrackByPosition).mockResolvedValue({
      success: false,
      reason: "error",
      message: "Cannot move",
    })

    const result = await invokeUse(warmBeer, deps, user.userId, createMockDefinition("warm-beer"), {
      targetQueueItemId: "q1",
    })

    expect(result.success).toBe(false)
    expect(result.message).toBe("Cannot move")
  })

  test("announces promotion with victim username and track title", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build({ username: "alice" })
    const victim = userFactory.build({ username: "bob" })
    stubRoomUsers(deps, [actor, victim])
    stubQueueTarget(deps, "meta-track-1", { title: "Stairway to Heaven", addedBy: victim })

    await invokeUse(warmBeer, deps, actor.userId, createMockDefinition("warm-beer"), {
      targetQueueItemId: "meta-track-1",
    })

    expect(deps.context.api.sendSystemMessage).toHaveBeenCalledWith(
      "room-1",
      'Slurp! alice cracked a Warm Beer and promoted bob\'s track, "Stairway to Heaven"!',
    )
  })

  test("announces promotion of own track", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build({ username: "alice" })
    stubRoomUsers(deps, [actor])
    stubQueueTarget(deps, "meta-track-1", { title: "My Song", addedBy: actor })

    await invokeUse(warmBeer, deps, actor.userId, createMockDefinition("warm-beer"), {
      targetQueueItemId: "meta-track-1",
    })

    expect(deps.context.api.sendSystemMessage).toHaveBeenCalledWith(
      "room-1",
      'Slurp! alice cracked a Warm Beer and promoted their own track, "My Song"!',
    )
  })

  test("announces promotion without queue adder", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build({ username: "alice" })
    stubRoomUsers(deps, [actor])
    stubQueueTarget(deps, "meta-track-1", { title: "Mystery Track", addedBy: undefined })

    await invokeUse(warmBeer, deps, actor.userId, createMockDefinition("warm-beer"), {
      targetQueueItemId: "meta-track-1",
    })

    expect(deps.context.api.sendSystemMessage).toHaveBeenCalledWith(
      "room-1",
      'Slurp! alice cracked a Warm Beer and promoted a track, "Mystery Track"!',
    )
  })
})
