import { describe, it, expect, vi, beforeEach } from "vitest"
import { injectSegmentTracksToQueue } from "./injectSegmentTracksToQueue"
import type { AppContext } from "@repo/types"
import type { Room } from "@repo/types/Room"

const m = vi.hoisted(() => ({
  findRoom: vi.fn(),
  isRoomAdmin: vi.fn(),
  findShowSegmentTracks: vi.fn(),
  getQueue: vi.fn(),
  setQueue: vi.fn(),
  getQueueWithDispatched: vi.fn(),
  queueSongAs: vi.fn(),
}))

vi.mock("../services/SchedulingService", () => ({
  findShowSegmentTracks: m.findShowSegmentTracks,
}))

vi.mock("./data", () => ({
  findRoom: m.findRoom,
  isRoomAdmin: m.isRoomAdmin,
  getQueue: m.getQueue,
  setQueue: m.setQueue,
}))

vi.mock("./data/djs", () => ({
  getQueueWithDispatched: m.getQueueWithDispatched,
}))

vi.mock("../services/DJService", () => ({
  DJService: vi.fn(function MockDJService() {
    return { queueSongAs: m.queueSongAs }
  }),
}))

function baseRoom(over: Partial<Room> = {}): Room {
  return {
    id: "r1",
    title: "T",
    creator: "u1",
    type: "jukebox",
    fetchMeta: true,
    extraInfo: undefined,
    password: null,
    enableSpotifyLogin: false,
    deputizeOnJoin: false,
    createdAt: "1",
    lastRefreshedAt: "1",
    playbackMode: "app-controlled",
    ...over,
  }
}

describe("injectSegmentTracksToQueue", () => {
  const emit = vi.fn()
  const context = {
    systemEvents: { emit },
  } as unknown as AppContext

  beforeEach(() => {
    vi.clearAllMocks()
    m.findRoom.mockResolvedValue(baseRoom())
    m.isRoomAdmin.mockResolvedValue(true)
    m.findShowSegmentTracks.mockResolvedValue([
      { spotifyTrackId: "t1", mediaSourceTrackId: "t1" },
      { spotifyTrackId: "t2", mediaSourceTrackId: "t2" },
    ])
    m.queueSongAs.mockImplementation(async (_roomId, _attr, trackId) => ({
      success: true,
      queuedItem: { track: { id: trackId } },
    }))
    m.getQueue.mockResolvedValue([
      { track: { id: "t1" } },
      { track: { id: "t2" } },
    ])
    m.getQueueWithDispatched.mockResolvedValue([
      { track: { id: "t1" } },
      { track: { id: "t2" } },
    ])
  })

  it("rejects top placement for spotify-controlled rooms", async () => {
    m.findRoom.mockResolvedValueOnce(baseRoom({ playbackMode: "spotify-controlled" }))
    const result = await injectSegmentTracksToQueue({
      context,
      roomId: "r1",
      userId: "u1",
      showSegmentId: "placement-1",
      placement: "top",
      segmentTitle: "Round 1",
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.status).toBe(400)
  })

  it("enqueues tracks bottom-up and emits a single QUEUE_CHANGED", async () => {
    const result = await injectSegmentTracksToQueue({
      context,
      roomId: "r1",
      userId: "u1",
      showSegmentId: "placement-1",
      placement: "bottom",
      segmentTitle: "Round 1",
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.added).toBe(2)
      expect(result.skipped).toBe(0)
    }
    expect(m.queueSongAs).toHaveBeenCalledTimes(2)
    expect(m.queueSongAs).toHaveBeenCalledWith(
      "r1",
      { type: "plugin", pluginName: "scheduler", displayName: "Round 1" },
      "t1",
      { runPluginValidation: false, suppressQueueChanged: true },
    )
    expect(m.setQueue).not.toHaveBeenCalled()
    expect(emit).toHaveBeenCalledWith("r1", "QUEUE_CHANGED", expect.any(Object))
  })

  it("moves added tracks to the front for top placement", async () => {
    const result = await injectSegmentTracksToQueue({
      context,
      roomId: "r1",
      userId: "u1",
      showSegmentId: "placement-1",
      placement: "top",
      segmentTitle: "Round 1",
    })

    expect(result.ok).toBe(true)
    expect(m.setQueue).toHaveBeenCalledWith({
      roomId: "r1",
      items: [{ track: { id: "t1" } }, { track: { id: "t2" } }],
      context,
    })
  })

  it("counts duplicate queue entries as skipped", async () => {
    m.queueSongAs
      .mockResolvedValueOnce({ success: true, queuedItem: { track: { id: "t1" } } })
      .mockResolvedValueOnce({ success: false, message: "already queued" })

    const result = await injectSegmentTracksToQueue({
      context,
      roomId: "r1",
      userId: "u1",
      showSegmentId: "placement-1",
      placement: "bottom",
      segmentTitle: "Round 1",
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.added).toBe(1)
      expect(result.skipped).toBe(1)
    }
  })
})
