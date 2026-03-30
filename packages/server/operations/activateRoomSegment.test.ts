import { describe, it, expect, vi, beforeEach } from "vitest"
import { activateRoomSegment } from "./activateRoomSegment"
import type { AppContext } from "@repo/types"
import type { Room } from "@repo/types/Room"

const m = vi.hoisted(() => ({
  findRoom: vi.fn(),
  saveRoom: vi.fn(),
  isAdminMember: vi.fn(),
  findShowById: vi.fn(),
  persistMessage: vi.fn(),
  getPluginConfig: vi.fn(),
  setPluginConfig: vi.fn(),
  deleteAllPluginConfigs: vi.fn(),
  getAllPluginConfigs: vi.fn(),
}))

vi.mock("../services/SchedulingService", () => ({
  findShowById: m.findShowById,
}))

vi.mock("./data", () => ({
  findRoom: m.findRoom,
  saveRoom: m.saveRoom,
  isAdminMember: m.isAdminMember,
}))

vi.mock("./data/messages", () => ({
  persistMessage: m.persistMessage,
}))

vi.mock("./data/pluginConfigs", () => ({
  getPluginConfig: m.getPluginConfig,
  setPluginConfig: m.setPluginConfig,
  deleteAllPluginConfigs: m.deleteAllPluginConfigs,
  getAllPluginConfigs: m.getAllPluginConfigs,
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
    showId: "show-1",
    ...over,
  }
}

describe("activateRoomSegment", () => {
  const emit = vi.fn()
  const context = {
    systemEvents: { emit },
    pluginRegistry: {
      syncRoomPlugins: vi.fn().mockResolvedValue(undefined),
    },
    redis: {} as AppContext["redis"],
  } as unknown as AppContext

  beforeEach(() => {
    vi.clearAllMocks()
    m.isAdminMember.mockResolvedValue(true)
    m.getPluginConfig.mockResolvedValue(null)
    m.getAllPluginConfigs.mockResolvedValue({})
    m.findShowById.mockResolvedValue({
      id: "show-1",
      segments: [
        {
          segmentId: "seg-1",
          segment: {
            id: "seg-1",
            title: "Intro",
            pluginPreset: null,
            duration: 5,
            status: "ready",
            description: null,
            isRecurring: false,
            createdBy: "u1",
            assignedTo: null,
            assignee: null,
            createdAt: "",
            updatedAt: "",
          },
        },
      ],
    })
    m.findRoom
      .mockResolvedValueOnce(baseRoom({ activeSegmentId: null, announceActiveSegment: false }))
      .mockResolvedValueOnce(baseRoom({ activeSegmentId: "seg-1", announceActiveSegment: false }))
  })

  it("rejects when room has no showId", async () => {
    m.findRoom.mockReset()
    m.findRoom.mockResolvedValueOnce(baseRoom({ showId: null }))
    const r = await activateRoomSegment({
      context,
      roomId: "r1",
      userId: "u1",
      segmentId: "seg-1",
      presetMode: "skip",
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.status).toBe(400)
  })

  it("rejects when user is not admin", async () => {
    m.findRoom.mockReset()
    m.findRoom.mockResolvedValueOnce(baseRoom({ creator: "other", showId: "show-1" }))
    m.isAdminMember.mockResolvedValueOnce(false)
    const r = await activateRoomSegment({
      context,
      roomId: "r1",
      userId: "u1",
      segmentId: "seg-1",
      presetMode: "skip",
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.status).toBe(403)
  })

  it("saves active segment and emits SEGMENT_ACTIVATED", async () => {
    const r = await activateRoomSegment({
      context,
      roomId: "r1",
      userId: "u1",
      segmentId: "seg-1",
      presetMode: "skip",
    })
    expect(r.ok).toBe(true)
    expect(m.saveRoom).toHaveBeenCalled()
    expect(emit).toHaveBeenCalledWith(
      "r1",
      "SEGMENT_ACTIVATED",
      expect.objectContaining({
        roomId: "r1",
        showId: "show-1",
        segmentId: "seg-1",
        segmentTitle: "Intro",
      }),
    )
    expect(emit).toHaveBeenCalledWith(
      "r1",
      "ROOM_SETTINGS_UPDATED",
      expect.any(Object),
    )
  })
})
