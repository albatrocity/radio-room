import { describe, expect, test, vi } from "vitest"
import { userFactory } from "@repo/factories"
import type { QueueItem } from "@repo/types"
import { scratchedCd } from "./index"
import { createMockDefinition, createMockDeps, invokeUse, stubRoomUsers } from "../shared/testHelpers"

describe("scratchedCd", () => {
  test("skips current track when playing", async () => {
    const deps = createMockDeps()
    const user = userFactory.build()
    stubRoomUsers(deps, [user])
    vi.mocked(deps.context.api.getNowPlaying).mockResolvedValue({
      title: "Song",
      mediaSource: { type: "spotify", trackId: "t-spotify-1" },
      addedAt: Date.now(),
    } as unknown as QueueItem)

    const result = await invokeUse(scratchedCd, deps, user.userId, createMockDefinition("scratched-cd"))

    expect(result.success).toBe(true)
    expect(deps.context.api.skipTrack).toHaveBeenCalledWith("room-1", "t-spotify-1")
  })

  test("fails when nothing is playing", async () => {
    const deps = createMockDeps()
    vi.mocked(deps.context.api.getNowPlaying).mockResolvedValue(null)

    const result = await invokeUse(scratchedCd, deps, "u1", createMockDefinition("scratched-cd"))

    expect(result.success).toBe(false)
    expect(result.message).toMatch(/Nothing is playing/i)
  })

  test("fails when skipTrack throws", async () => {
    const deps = createMockDeps()
    const user = userFactory.build()
    stubRoomUsers(deps, [user])
    vi.mocked(deps.context.api.getNowPlaying).mockResolvedValue({
      title: "Song",
      mediaSource: { type: "spotify", trackId: "t1" },
      addedAt: Date.now(),
    } as unknown as QueueItem)
    vi.mocked(deps.context.api.skipTrack).mockRejectedValue(new Error("boom"))
    vi.spyOn(console, "error").mockImplementation(() => {})

    const result = await invokeUse(scratchedCd, deps, user.userId, createMockDefinition("scratched-cd"))

    expect(result.success).toBe(false)
    expect(result.message).toMatch(/Could not skip/i)
  })
})
