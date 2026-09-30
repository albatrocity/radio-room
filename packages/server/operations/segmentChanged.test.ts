import { beforeEach, describe, expect, it, vi } from "vitest"
import type { AppContext } from "@repo/types"
import type { Room } from "@repo/types/Room"

const m = vi.hoisted(() => ({
  findShowIdsBySegmentId: vi.fn(),
  findRoomsByShowIds: vi.fn(),
  refreshRoomScheduleSnapshot: vi.fn(),
  enterStreamingMode: vi.fn(),
}))

vi.mock("../services/SchedulingService", () => ({
  findShowIdsBySegmentId: m.findShowIdsBySegmentId,
}))
vi.mock("./data", () => ({ findRoomsByShowIds: m.findRoomsByShowIds }))
vi.mock("./scheduleRedisSnapshot", () => ({
  refreshRoomScheduleSnapshot: m.refreshRoomScheduleSnapshot,
}))
vi.mock("./room/applyFetchMetaTransitionEffects", () => ({
  enterStreamingMode: m.enterStreamingMode,
}))

import { afterSegmentChanged } from "./segmentChanged"

const context = {} as AppContext

function room(over: Partial<Room>): Room {
  return {
    id: "r1",
    title: "Room",
    creator: "u1",
    type: "radio",
    fetchMeta: false,
    extraInfo: undefined,
    password: null,
    enableSpotifyLogin: false,
    deputizeOnJoin: false,
    createdAt: "1",
    lastRefreshedAt: "1",
    ...over,
  }
}

describe("afterSegmentChanged", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.findShowIdsBySegmentId.mockResolvedValue(["show-1"])
    m.findRoomsByShowIds.mockResolvedValue([])
  })

  it("refreshes snapshots and rebuilds streaming display only where the segment is active", async () => {
    m.findRoomsByShowIds.mockResolvedValue([
      { roomId: "r1", room: room({ id: "r1", activeSegmentId: "seg-1" }) },
      { roomId: "r2", room: room({ id: "r2", activeSegmentId: "seg-1", fetchMeta: true }) },
      { roomId: "r3", room: room({ id: "r3", activeSegmentId: "seg-other" }) },
    ])

    await afterSegmentChanged(context, "seg-1", { refreshStreamingDisplay: true })

    expect(m.refreshRoomScheduleSnapshot).toHaveBeenCalledTimes(3)
    expect(m.enterStreamingMode).toHaveBeenCalledTimes(1)
    expect(m.enterStreamingMode).toHaveBeenCalledWith(context, "r1")
  })

  it("refreshes snapshots without rebuilding Now Playing when the display is unchanged", async () => {
    m.findRoomsByShowIds.mockResolvedValue([
      { roomId: "r1", room: room({ id: "r1", activeSegmentId: "seg-1" }) },
    ])

    await afterSegmentChanged(context, "seg-1", { refreshStreamingDisplay: false })

    expect(m.refreshRoomScheduleSnapshot).toHaveBeenCalledTimes(1)
    expect(m.enterStreamingMode).not.toHaveBeenCalled()
  })

  it("looks up rooms for every show containing the segment in one call", async () => {
    m.findShowIdsBySegmentId.mockResolvedValue(["show-1", "show-2", "show-3"])

    await afterSegmentChanged(context, "seg-1", { refreshStreamingDisplay: true })

    expect(m.findRoomsByShowIds).toHaveBeenCalledTimes(1)
    expect(m.findRoomsByShowIds).toHaveBeenCalledWith(
      context,
      new Set(["show-1", "show-2", "show-3"]),
    )
    expect(m.refreshRoomScheduleSnapshot).not.toHaveBeenCalled()
  })

  it("uses show ids captured before a delete instead of looking the segment up", async () => {
    await afterSegmentChanged(context, "seg-1", {
      showIds: ["show-9"],
      refreshStreamingDisplay: true,
    })

    expect(m.findShowIdsBySegmentId).not.toHaveBeenCalled()
    expect(m.findRoomsByShowIds).toHaveBeenCalledWith(context, new Set(["show-9"]))
  })

  it("no-ops without a context", async () => {
    await afterSegmentChanged(undefined, "seg-1", { refreshStreamingDisplay: true })
    expect(m.findShowIdsBySegmentId).not.toHaveBeenCalled()
  })
})
