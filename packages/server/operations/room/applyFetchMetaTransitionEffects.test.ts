import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  enterStreamingMode,
  applyFetchMetaTransitionEffects,
  refreshNowPlayingFromStationMeta,
} from "./applyFetchMetaTransitionEffects"
import type { AppContext, RoomScheduleSnapshotDTO } from "@repo/types"
import type { Room } from "@repo/types/Room"

const m = vi.hoisted(() => ({
  findRoom: vi.fn(),
  getRoomCurrent: vi.fn(),
  setRoomCurrent: vi.fn(),
  clearRoomCurrent: vi.fn(),
  handleRoomNowPlayingData: vi.fn(),
  readRoomScheduleSnapshot: vi.fn(),
}))

vi.mock("../data", () => ({
  findRoom: m.findRoom,
  getRoomCurrent: m.getRoomCurrent,
  setRoomCurrent: m.setRoomCurrent,
  clearRoomCurrent: m.clearRoomCurrent,
}))

vi.mock("./handleRoomNowPlayingData", () => ({
  default: m.handleRoomNowPlayingData,
}))

vi.mock("../scheduleRedisSnapshot", () => ({
  readRoomScheduleSnapshot: m.readRoomScheduleSnapshot,
}))

vi.mock("../../lib/makeNowPlayingFromStationMeta", () => ({
  makeStableTrackId: vi.fn(() => "stable-id"),
}))

function baseRoom(over: Partial<Room> = {}): Room {
  return {
    id: "r1",
    title: "My Room",
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

describe("enterStreamingMode", () => {
  const emit = vi.fn()
  const context = {
    systemEvents: { emit },
    redis: { pubClient: {} },
  } as unknown as AppContext

  beforeEach(() => {
    vi.clearAllMocks()
    m.clearRoomCurrent.mockResolvedValue(null)
    m.setRoomCurrent.mockResolvedValue(undefined)
    m.getRoomCurrent.mockResolvedValue({ title: "My Room" })
    m.readRoomScheduleSnapshot.mockResolvedValue(null)
    emit.mockResolvedValue(undefined)
  })

  it("clears current and sets room-branding meta", async () => {
    m.findRoom.mockResolvedValue(baseRoom())

    await enterStreamingMode(context, "r1")

    expect(m.clearRoomCurrent).toHaveBeenCalledWith({ context, roomId: "r1" })
    expect(m.setRoomCurrent).toHaveBeenCalledWith({
      context,
      roomId: "r1",
      meta: expect.objectContaining({
        title: "My Room",
        artist: "",
        album: "",
        track: "My Room",
      }),
    })
  })

  it("includes segment title as artist when schedule is public", async () => {
    m.findRoom.mockResolvedValue(
      baseRoom({ showSchedulePublic: true, activeSegmentId: "seg-1" }),
    )
    m.readRoomScheduleSnapshot.mockResolvedValue({
      version: 1,
      showId: "s1",
      showTitle: "Show",
      startTime: "",
      updatedAt: "",
      segments: [
        {
          segmentId: "seg-1",
          position: 0,
          durationOverride: null,
          durationMinutes: 30,
          segment: { title: "Intro", pluginPreset: null },
        },
      ],
    } satisfies RoomScheduleSnapshotDTO)

    await enterStreamingMode(context, "r1")

    expect(m.setRoomCurrent).toHaveBeenCalledWith({
      context,
      roomId: "r1",
      meta: expect.objectContaining({ artist: "Intro" }),
    })

    const meta = m.setRoomCurrent.mock.calls[0][0].meta
    expect(meta.nowPlaying.track.artists).toEqual([
      { id: "segment", title: "Intro", urls: [] },
    ])
  })

  it("emits TRACK_CHANGED and MEDIA_SOURCE_STATUS_CHANGED", async () => {
    m.findRoom.mockResolvedValue(baseRoom())

    await enterStreamingMode(context, "r1")

    expect(emit).toHaveBeenCalledWith("r1", "TRACK_CHANGED", expect.anything())
    expect(emit).toHaveBeenCalledWith("r1", "MEDIA_SOURCE_STATUS_CHANGED", {
      roomId: "r1",
      status: "online",
      sourceType: "radio",
    })
  })

  it("does nothing if room not found", async () => {
    m.findRoom.mockResolvedValue(null)

    await enterStreamingMode(context, "r1")

    expect(m.setRoomCurrent).not.toHaveBeenCalled()
    expect(emit).not.toHaveBeenCalled()
  })
})

describe("applyFetchMetaTransitionEffects", () => {
  const emit = vi.fn()
  const context = {
    systemEvents: { emit },
    redis: { pubClient: {} },
  } as unknown as AppContext

  beforeEach(() => {
    vi.clearAllMocks()
    m.clearRoomCurrent.mockResolvedValue(null)
    m.setRoomCurrent.mockResolvedValue(undefined)
    m.getRoomCurrent.mockResolvedValue(null)
    m.findRoom.mockResolvedValue(baseRoom())
    m.handleRoomNowPlayingData.mockResolvedValue(null)
    m.readRoomScheduleSnapshot.mockResolvedValue(null)
    emit.mockResolvedValue(undefined)
  })

  it("does nothing when fetchMeta did not change", async () => {
    await applyFetchMetaTransitionEffects({
      context,
      roomId: "r1",
      previousFetchMeta: true,
      newFetchMeta: true,
    })

    expect(m.clearRoomCurrent).not.toHaveBeenCalled()
  })

  it("calls enterStreamingMode when toggling ON -> OFF", async () => {
    await applyFetchMetaTransitionEffects({
      context,
      roomId: "r1",
      previousFetchMeta: true,
      newFetchMeta: false,
    })

    expect(m.clearRoomCurrent).toHaveBeenCalled()
    expect(m.setRoomCurrent).toHaveBeenCalled()
    const meta = m.setRoomCurrent.mock.calls[0][0].meta
    expect(meta.title).toBe("My Room")
  })

  it("calls refreshNowPlayingFromStationMeta when toggling OFF -> ON", async () => {
    m.clearRoomCurrent.mockResolvedValue({
      stationMeta: { title: "Song|Artist|Album" },
    })

    await applyFetchMetaTransitionEffects({
      context,
      roomId: "r1",
      previousFetchMeta: false,
      newFetchMeta: true,
    })

    expect(m.clearRoomCurrent).toHaveBeenCalled()
    expect(m.handleRoomNowPlayingData).toHaveBeenCalledWith({
      context,
      roomId: "r1",
      submission: expect.objectContaining({
        title: "Song",
        artist: "Artist",
        album: "Album",
      }),
    })
  })
})
