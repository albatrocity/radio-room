import { describe, it, expect, vi, beforeEach } from "vitest"
import handleRoomNowPlayingData from "./handleRoomNowPlayingData"
import type { AppContext } from "@repo/types"
import type { Room } from "@repo/types/Room"

const m = vi.hoisted(() => ({
  findRoom: vi.fn(),
  getRoomCurrent: vi.fn(),
  setRoomCurrent: vi.fn(),
  addTrackToRoomPlaylist: vi.fn(),
  clearRoomCurrent: vi.fn(),
  getQueue: vi.fn(),
  removeFromQueue: vi.fn(),
  getDispatchedTrack: vi.fn(),
  clearDispatchedTrack: vi.fn(),
  writeJsonToHset: vi.fn(),
}))

vi.mock("../data", () => ({
  findRoom: m.findRoom,
  getRoomCurrent: m.getRoomCurrent,
  setRoomCurrent: m.setRoomCurrent,
  addTrackToRoomPlaylist: m.addTrackToRoomPlaylist,
  clearRoomCurrent: m.clearRoomCurrent,
  getQueue: m.getQueue,
  removeFromQueue: m.removeFromQueue,
  getDispatchedTrack: m.getDispatchedTrack,
  clearDispatchedTrack: m.clearDispatchedTrack,
}))

vi.mock("../data/utils", () => ({
  writeJsonToHset: m.writeJsonToHset,
}))

vi.mock("../../services/AdapterService", () => ({
  AdapterService: vi.fn(),
}))

function baseRoom(over: Partial<Room> = {}): Room {
  return {
    id: "r1",
    title: "My Radio Room",
    creator: "u1",
    type: "radio",
    fetchMeta: true,
    extraInfo: undefined,
    password: null,
    enableSpotifyLogin: false,
    deputizeOnJoin: false,
    createdAt: "1",
    lastRefreshedAt: "1",
    ...over,
  }
}

describe("handleRoomNowPlayingData — streaming mode early return", () => {
  const emit = vi.fn()
  const context = {
    systemEvents: { emit },
    redis: {
      pubClient: { get: vi.fn(), publish: vi.fn() },
      subClient: {},
    },
  } as unknown as AppContext

  const submission = {
    trackId: "track-abc",
    sourceType: "shoutcast" as const,
    title: "Actual Song",
    artist: "Actual Artist",
    album: "Actual Album",
    stationMeta: { title: "Actual Song|Actual Artist|Actual Album", bitrate: "128" },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    m.getRoomCurrent.mockResolvedValue(null)
    m.setRoomCurrent.mockResolvedValue(undefined)
    m.addTrackToRoomPlaylist.mockResolvedValue(undefined)
    m.getQueue.mockResolvedValue([])
    m.getDispatchedTrack.mockResolvedValue(null)
    m.clearDispatchedTrack.mockResolvedValue(undefined)
    m.writeJsonToHset.mockResolvedValue(undefined)
    emit.mockResolvedValue(undefined)
  })

  it("returns early when fetchMeta is off for a radio room — no track processing", async () => {
    m.findRoom.mockResolvedValue(baseRoom({ fetchMeta: false }))

    const result = await handleRoomNowPlayingData({ context, roomId: "r1", submission })

    expect(result).toBeNull()
    expect(m.setRoomCurrent).not.toHaveBeenCalled()
    expect(m.addTrackToRoomPlaylist).not.toHaveBeenCalled()
    expect(emit).not.toHaveBeenCalledWith("r1", "TRACK_CHANGED", expect.anything())
    expect(emit).not.toHaveBeenCalledWith("r1", "PLAYLIST_TRACK_ADDED", expect.anything())
  })

  it("still stores stationMeta in Redis when in streaming mode", async () => {
    m.findRoom.mockResolvedValue(baseRoom({ fetchMeta: false }))

    await handleRoomNowPlayingData({ context, roomId: "r1", submission })

    expect(m.writeJsonToHset).toHaveBeenCalledWith(
      expect.objectContaining({
        setKey: "room:r1:current",
        attributes: { stationMeta: JSON.stringify(submission.stationMeta) },
      }),
    )
  })

  it("emits MEDIA_SOURCE_STATUS_CHANGED online in streaming mode", async () => {
    m.findRoom.mockResolvedValue(baseRoom({ fetchMeta: false }))

    await handleRoomNowPlayingData({ context, roomId: "r1", submission })

    expect(emit).toHaveBeenCalledWith("r1", "MEDIA_SOURCE_STATUS_CHANGED", {
      roomId: "r1",
      status: "online",
      sourceType: "radio",
      bitrate: 128,
    })
  })

  it("processes tracks normally when fetchMeta is on", async () => {
    m.findRoom.mockResolvedValue(baseRoom({ fetchMeta: true }))
    m.getRoomCurrent
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ title: "Actual Song" })

    await handleRoomNowPlayingData({ context, roomId: "r1", submission })

    expect(m.setRoomCurrent).toHaveBeenCalled()
    expect(m.addTrackToRoomPlaylist).toHaveBeenCalled()
    expect(emit).toHaveBeenCalledWith("r1", "TRACK_CHANGED", expect.anything())
  })

  it("processes tracks for jukebox rooms even when fetchMeta is off", async () => {
    m.findRoom.mockResolvedValue(baseRoom({ type: "jukebox", fetchMeta: false }))
    m.getRoomCurrent
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ title: "Actual Song" })

    await handleRoomNowPlayingData({ context, roomId: "r1", submission })

    expect(m.setRoomCurrent).toHaveBeenCalled()
    expect(m.addTrackToRoomPlaylist).toHaveBeenCalled()
  })

  it("does not clear current on offline when in streaming mode", async () => {
    m.findRoom.mockResolvedValue(baseRoom({ fetchMeta: false }))

    await handleRoomNowPlayingData({ context, roomId: "r1" })

    expect(m.clearRoomCurrent).not.toHaveBeenCalled()
    expect(emit).toHaveBeenCalledWith("r1", "MEDIA_SOURCE_STATUS_CHANGED", {
      roomId: "r1",
      status: "offline",
      sourceType: "radio",
      error: undefined,
    })
  })

  it("clears current on offline when track detection is on", async () => {
    m.findRoom.mockResolvedValue(baseRoom({ fetchMeta: true }))

    await handleRoomNowPlayingData({ context, roomId: "r1" })

    expect(m.clearRoomCurrent).toHaveBeenCalled()
  })
})

describe("handleRoomNowPlayingData — live room type", () => {
  const emit = vi.fn()
  const context = {
    systemEvents: { emit },
    redis: {
      pubClient: { get: vi.fn(), publish: vi.fn() },
      subClient: {},
    },
  } as unknown as AppContext

  const submission = {
    trackId: "track-abc",
    sourceType: "rtmp" as const,
    title: "Actual Song",
    artist: "Actual Artist",
    album: "Actual Album",
    stationMeta: { title: "Actual Song|Actual Artist|Actual Album", bitrate: "128" },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    m.getRoomCurrent.mockResolvedValue(null)
    m.setRoomCurrent.mockResolvedValue(undefined)
    m.addTrackToRoomPlaylist.mockResolvedValue(undefined)
    m.getQueue.mockResolvedValue([])
    m.getDispatchedTrack.mockResolvedValue(null)
    m.clearDispatchedTrack.mockResolvedValue(undefined)
    m.writeJsonToHset.mockResolvedValue(undefined)
    emit.mockResolvedValue(undefined)
  })

  it("emits sourceType 'live' in streaming mode for live rooms", async () => {
    m.findRoom.mockResolvedValue(baseRoom({ type: "live", fetchMeta: false }))

    await handleRoomNowPlayingData({ context, roomId: "r1", submission })

    expect(emit).toHaveBeenCalledWith("r1", "MEDIA_SOURCE_STATUS_CHANGED", {
      roomId: "r1",
      status: "online",
      sourceType: "live",
      bitrate: 128,
    })
  })

  it("returns early when fetchMeta is off for a live room — no track processing", async () => {
    m.findRoom.mockResolvedValue(baseRoom({ type: "live", fetchMeta: false }))

    const result = await handleRoomNowPlayingData({ context, roomId: "r1", submission })

    expect(result).toBeNull()
    expect(m.setRoomCurrent).not.toHaveBeenCalled()
    expect(m.addTrackToRoomPlaylist).not.toHaveBeenCalled()
  })

  it("emits sourceType 'live' on offline for live rooms", async () => {
    m.findRoom.mockResolvedValue(baseRoom({ type: "live", fetchMeta: false }))

    await handleRoomNowPlayingData({ context, roomId: "r1" })

    expect(emit).toHaveBeenCalledWith("r1", "MEDIA_SOURCE_STATUS_CHANGED", {
      roomId: "r1",
      status: "offline",
      sourceType: "live",
      error: undefined,
    })
  })
})

describe("handleRoomNowPlayingData — artworkStreamingOnly", () => {
  const emit = vi.fn()
  const context = {
    systemEvents: { emit },
    redis: {
      pubClient: { get: vi.fn(), publish: vi.fn() },
      subClient: {},
    },
  } as unknown as AppContext

  const submission = {
    trackId: "track-abc",
    sourceType: "shoutcast" as const,
    title: "Actual Song",
    artist: "Actual Artist",
    album: "Actual Album",
    stationMeta: { title: "Actual Song|Actual Artist|Actual Album", bitrate: "128" },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    m.getRoomCurrent.mockResolvedValue(null)
    m.setRoomCurrent.mockResolvedValue(undefined)
    m.addTrackToRoomPlaylist.mockResolvedValue(undefined)
    m.getQueue.mockResolvedValue([])
    m.getDispatchedTrack.mockResolvedValue(null)
    m.clearDispatchedTrack.mockResolvedValue(undefined)
    m.writeJsonToHset.mockResolvedValue(undefined)
    emit.mockResolvedValue(undefined)
  })

  it("uses room artwork when artworkStreamingOnly is false (default)", async () => {
    m.findRoom.mockResolvedValue(baseRoom({ fetchMeta: true, artwork: "room.png" }))
    m.getRoomCurrent
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ title: "Actual Song" })

    await handleRoomNowPlayingData({ context, roomId: "r1", submission })

    const meta = m.setRoomCurrent.mock.calls[0][0].meta
    expect(meta.artwork).toBe("room.png")
  })

  it("skips room artwork when artworkStreamingOnly is true and track detection is on", async () => {
    m.findRoom.mockResolvedValue(
      baseRoom({ fetchMeta: true, artwork: "room.png", artworkStreamingOnly: true }),
    )
    m.getRoomCurrent
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ title: "Actual Song" })

    await handleRoomNowPlayingData({ context, roomId: "r1", submission })

    const meta = m.setRoomCurrent.mock.calls[0][0].meta
    expect(meta.artwork).not.toBe("room.png")
  })
})
