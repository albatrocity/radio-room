import { describe, expect, test, vi, beforeEach } from "vitest"
import { PluginAPIImpl } from "./PluginAPI"
import { AppContext } from "@repo/types"
import {
  appContextFactory,
  queueItemFactory,
  roomFactory,
  metadataSourceTrackFactory,
} from "@repo/factories"
import { Server } from "socket.io"

const adapterApiMocks = vi.hoisted(() => {
  const skipToNextTrack = vi.fn()
  const playTrack = vi.fn()
  const getRoomPlaybackController = vi.fn().mockResolvedValue({
    api: { skipToNextTrack, playTrack },
  })
  class MockAdapterService {
    getRoomPlaybackController = getRoomPlaybackController
  }
  return {
    MockAdapterService,
    skipToNextTrack,
    playTrack,
    getRoomPlaybackController,
  }
})

vi.mock("../../operations/data", () => ({
  getRoomCurrent: vi.fn(),
  findRoom: vi.fn(),
  popNextFromQueue: vi.fn(),
  setDispatchedTrack: vi.fn(),
  getQueueWithDispatched: vi.fn(),
  clearDispatchedTrack: vi.fn(),
}))

vi.mock("../../services/AdapterService", () => ({
  AdapterService: adapterApiMocks.MockAdapterService,
}))

import {
  getRoomCurrent,
  findRoom,
  popNextFromQueue,
  setDispatchedTrack,
  getQueueWithDispatched,
  clearDispatchedTrack,
} from "../../operations/data"

describe("PluginAPIImpl.skipTrack", () => {
  let api: PluginAPIImpl
  let mockContext: AppContext
  let mockIo: Server
  const roomId = "room-1"
  const trackId = "playing-track-id"

  const nowPlaying = queueItemFactory.build({
    mediaSource: { type: "spotify", trackId },
    track: metadataSourceTrackFactory.build({ id: trackId }),
  })

  const { skipToNextTrack, playTrack } = adapterApiMocks

  beforeEach(() => {
    vi.clearAllMocks()
    adapterApiMocks.getRoomPlaybackController.mockResolvedValue({
      api: { skipToNextTrack, playTrack },
    })
    playTrack.mockResolvedValue(undefined)
    mockContext = appContextFactory.build()
    mockContext.systemEvents = { emit: vi.fn() }
    mockIo = {} as Server
    api = new PluginAPIImpl(mockContext, mockIo)

    vi.mocked(getRoomCurrent).mockResolvedValue({
      nowPlaying,
      dj: null,
    } as Awaited<ReturnType<typeof getRoomCurrent>>)
  })

  test("aborts when now playing does not match trackId", async () => {
    vi.mocked(getRoomCurrent).mockResolvedValue({
      nowPlaying: queueItemFactory.build({
        mediaSource: { type: "spotify", trackId: "other" },
      }),
    } as Awaited<ReturnType<typeof getRoomCurrent>>)

    await api.skipTrack(roomId, trackId)

    expect(findRoom).not.toHaveBeenCalled()
    expect(skipToNextTrack).not.toHaveBeenCalled()
    expect(playTrack).not.toHaveBeenCalled()
  })

  test("spotify-controlled: calls skipToNextTrack only", async () => {
    vi.mocked(findRoom).mockResolvedValue(
      roomFactory.build({ id: roomId, playbackMode: "spotify-controlled" }),
    )

    await api.skipTrack(roomId, trackId)

    expect(popNextFromQueue).not.toHaveBeenCalled()
    expect(skipToNextTrack).toHaveBeenCalledTimes(1)
    expect(playTrack).not.toHaveBeenCalled()
    expect(mockContext.systemEvents?.emit).not.toHaveBeenCalled()
  })

  test("default playback mode (unset): calls skipToNextTrack only", async () => {
    vi.mocked(findRoom).mockResolvedValue(roomFactory.build({ id: roomId }))

    await api.skipTrack(roomId, trackId)

    expect(popNextFromQueue).not.toHaveBeenCalled()
    expect(skipToNextTrack).toHaveBeenCalledTimes(1)
  })

  test("app-controlled: pops queue, dispatches, playTrack, emits QUEUE_CHANGED", async () => {
    vi.mocked(findRoom).mockResolvedValue(
      roomFactory.build({ id: roomId, playbackMode: "app-controlled" }),
    )

    const nextTrack = metadataSourceTrackFactory.build({
      id: "next-id",
      urls: [{ type: "resource" as const, url: "spotify:track:next" }],
    })
    const nextItem = queueItemFactory.build({ track: nextTrack })

    vi.mocked(popNextFromQueue).mockResolvedValue(nextItem)
    vi.mocked(getQueueWithDispatched).mockResolvedValue([nextItem])

    await api.skipTrack(roomId, trackId)

    expect(popNextFromQueue).toHaveBeenCalledWith({ context: mockContext, roomId })
    expect(setDispatchedTrack).toHaveBeenCalledWith({
      context: mockContext,
      roomId,
      item: nextItem,
    })
    expect(playTrack).toHaveBeenCalledWith("spotify:track:next")
    expect(skipToNextTrack).not.toHaveBeenCalled()
    expect(mockContext.systemEvents?.emit).toHaveBeenCalledWith(roomId, "QUEUE_CHANGED", {
      roomId,
      queue: [nextItem],
    })
  })

  test("app-controlled: empty queue falls back to skipToNextTrack", async () => {
    vi.mocked(findRoom).mockResolvedValue(
      roomFactory.build({ id: roomId, playbackMode: "app-controlled" }),
    )
    vi.mocked(popNextFromQueue).mockResolvedValue(null)

    await api.skipTrack(roomId, trackId)

    expect(skipToNextTrack).toHaveBeenCalledTimes(1)
    expect(playTrack).not.toHaveBeenCalled()
    expect(setDispatchedTrack).not.toHaveBeenCalled()
  })

  test("app-controlled: missing resource URI clears dispatched and falls back to skip", async () => {
    vi.mocked(findRoom).mockResolvedValue(
      roomFactory.build({ id: roomId, playbackMode: "app-controlled" }),
    )
    const nextItem = queueItemFactory.build({
      track: metadataSourceTrackFactory.build({ urls: [] }),
    })
    vi.mocked(popNextFromQueue).mockResolvedValue(nextItem)

    await api.skipTrack(roomId, trackId)

    expect(clearDispatchedTrack).toHaveBeenCalledWith({ context: mockContext, roomId })
    expect(skipToNextTrack).toHaveBeenCalledTimes(1)
    expect(playTrack).not.toHaveBeenCalled()
  })

  test("app-controlled: playTrack failure clears dispatched and does not emit", async () => {
    vi.mocked(findRoom).mockResolvedValue(
      roomFactory.build({ id: roomId, playbackMode: "app-controlled" }),
    )
    const nextItem = queueItemFactory.build({
      track: metadataSourceTrackFactory.build({
        urls: [{ type: "resource" as const, url: "spotify:track:bad" }],
      }),
    })
    vi.mocked(popNextFromQueue).mockResolvedValue(nextItem)
    playTrack.mockRejectedValue(new Error("Spotify error"))

    await api.skipTrack(roomId, trackId)

    expect(clearDispatchedTrack).toHaveBeenCalledWith({ context: mockContext, roomId })
    expect(mockContext.systemEvents?.emit).not.toHaveBeenCalled()
  })

  test("throws when room is missing", async () => {
    vi.mocked(findRoom).mockResolvedValue(null)

    await expect(api.skipTrack(roomId, trackId)).rejects.toThrow("Room not found")
  })
})
