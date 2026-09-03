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
  const setVolume = vi.fn()
  const getRoomPlaybackController = vi.fn().mockResolvedValue({
    api: { skipToNextTrack, playTrack, setVolume },
  })
  class MockAdapterService {
    getRoomPlaybackController = getRoomPlaybackController
  }
  return {
    MockAdapterService,
    skipToNextTrack,
    playTrack,
    setVolume,
    getRoomPlaybackController,
  }
})

const bridgeMocks = vi.hoisted(() => ({
  getBridgeRpcClient: vi.fn(),
  getLocalPlaylistCoverArt: vi.fn(),
}))

vi.mock("../../operations/data", () => ({
  getRoomCurrent: vi.fn(),
  findRoom: vi.fn(),
  popNextFromQueue: vi.fn(),
  setDispatchedTrack: vi.fn(),
  buildQueueChangedData: vi.fn(),
  clearDispatchedTrack: vi.fn(),
  storeImage: vi.fn(),
  getRoomUsers: vi.fn(),
  getOnlineUserSocketId: vi.fn(),
  getOnlineUserIds: vi.fn(),
  getQueue: vi.fn(),
  setQueueSplit: vi.fn(),
  clearQueueSplit: vi.fn(),
}))

vi.mock("../../services/AdapterService", () => ({
  AdapterService: adapterApiMocks.MockAdapterService,
}))

vi.mock("@repo/adapter-bridge", () => ({
  getBridgeRpcClient: bridgeMocks.getBridgeRpcClient,
  getLocalPlaylistCoverArt: bridgeMocks.getLocalPlaylistCoverArt,
}))

import {
  getRoomCurrent,
  findRoom,
  popNextFromQueue,
  setDispatchedTrack,
  buildQueueChangedData,
  clearDispatchedTrack,
  storeImage,
  getRoomUsers,
  getOnlineUserSocketId,
  getOnlineUserIds,
  getQueue,
  setQueueSplit,
  clearQueueSplit,
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
    vi.mocked(buildQueueChangedData).mockResolvedValue({
      roomId,
      queue: [nextItem],
      splitKey: null,
    })

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
      splitKey: null,
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

describe("PluginAPIImpl.setPlaybackVolume", () => {
  let api: PluginAPIImpl
  let mockContext: AppContext
  const roomId = "room-1"
  const { setVolume, getRoomPlaybackController } = adapterApiMocks

  beforeEach(() => {
    vi.clearAllMocks()
    adapterApiMocks.getRoomPlaybackController.mockResolvedValue({
      api: { setVolume },
    })
    setVolume.mockResolvedValue(undefined)
    mockContext = appContextFactory.build()
    api = new PluginAPIImpl(mockContext, {} as Server)
  })

  test("clamps and calls controller setVolume", async () => {
    const result = await api.setPlaybackVolume(roomId, 150.4)

    expect(result).toEqual({ success: true })
    expect(setVolume).toHaveBeenCalledWith(100)
  })

  test("returns failure when controller missing", async () => {
    getRoomPlaybackController.mockResolvedValue(null)

    const result = await api.setPlaybackVolume(roomId, 50)

    expect(result).toEqual({
      success: false,
      message: "No playback controller configured for this room",
    })
  })

  test("returns failure when volume unsupported", async () => {
    getRoomPlaybackController.mockResolvedValue({ api: {} })

    const result = await api.setPlaybackVolume(roomId, 50)

    expect(result).toEqual({
      success: false,
      message: "Playback controller does not support volume control",
    })
  })
})

describe("PluginAPIImpl.supportsVolumeControl", () => {
  let api: PluginAPIImpl
  const roomId = "room-1"
  const { setVolume, getRoomPlaybackController } = adapterApiMocks

  beforeEach(() => {
    vi.clearAllMocks()
    api = new PluginAPIImpl(appContextFactory.build(), {} as Server)
  })

  test("returns true when setVolume is available", async () => {
    getRoomPlaybackController.mockResolvedValue({ api: { setVolume } })
    await expect(api.supportsVolumeControl(roomId)).resolves.toBe(true)
  })

  test("returns false when controller missing", async () => {
    getRoomPlaybackController.mockResolvedValue(null)
    await expect(api.supportsVolumeControl(roomId)).resolves.toBe(false)
  })
})

describe("PluginAPIImpl metadata source access queries", () => {
  const roomId = "room-1"
  const userId = "user-1"
  const canAccess = vi.fn()
  const getEffectiveSourceIdsForUser = vi.fn()
  const listMetadataSources = vi.fn()

  let api: PluginAPIImpl

  beforeEach(() => {
    vi.clearAllMocks()
    const mockContext = appContextFactory.build({
      metadataSourceAccess: {
        canAccess,
        getEffectiveSourceIdsForUser,
        listMetadataSources,
      },
    } as Partial<AppContext>)
    api = new PluginAPIImpl(mockContext, {} as Server)
  })

  test("canAccessMetadataSource delegates to MetadataSourceAccessService", async () => {
    canAccess.mockResolvedValue(true)
    const params = { roomId, userId, sourceId: "youtube", action: "search" as const }
    await expect(api.canAccessMetadataSource(params)).resolves.toBe(true)
    expect(canAccess).toHaveBeenCalledWith(params)
  })

  test("getEffectiveMetadataSourceIds delegates to getEffectiveSourceIdsForUser", async () => {
    getEffectiveSourceIdsForUser.mockResolvedValue(["spotify", "local"])
    await expect(api.getEffectiveMetadataSourceIds(roomId, userId, "queue")).resolves.toEqual([
      "spotify",
      "local",
    ])
    expect(getEffectiveSourceIdsForUser).toHaveBeenCalledWith(roomId, userId, "queue")
  })
})

describe("PluginAPIImpl.getLocalPlaylistArtwork", () => {
  test("stores sm and lg variants and returns both URLs", async () => {
    bridgeMocks.getBridgeRpcClient.mockReturnValue({})
    bridgeMocks.getLocalPlaylistCoverArt.mockResolvedValue({
      "nd-lp": {
        sm: "data:image/jpeg;base64,aaa",
        lg: "data:image/jpeg;base64,bbb",
      },
    })
    vi.mocked(storeImage).mockResolvedValue({ success: true })

    const mockContext = appContextFactory.build()
    mockContext.apiUrl = "https://api.example"
    const api = new PluginAPIImpl(mockContext, {} as Server)

    await expect(api.getLocalPlaylistArtwork("room-1", ["nd-lp"])).resolves.toEqual({
      "nd-lp": {
        imageUrl: expect.stringMatching(
          /^https:\/\/api\.example\/api\/rooms\/room-1\/images\/pl-cover-nd-lp-[0-9a-f]{8}$/,
        ),
        imageUrlLarge: expect.stringMatching(
          /^https:\/\/api\.example\/api\/rooms\/room-1\/images\/pl-cover-nd-lp-[0-9a-f]{8}-lg$/,
        ),
      },
    })
    expect(storeImage).toHaveBeenCalledTimes(2)
    expect(vi.mocked(storeImage).mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ imageId: expect.stringMatching(/^pl-cover-nd-lp-[0-9a-f]{8}$/) }),
    )
    expect(vi.mocked(storeImage).mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        imageId: expect.stringMatching(/^pl-cover-nd-lp-[0-9a-f]{8}-lg$/),
      }),
    )
  })
})

describe("PluginAPIImpl.setQueueSplit", () => {
  const roomId = "room-1"

  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("persists belowKey and emits QUEUE_CHANGED for app-controlled rooms", async () => {
    const emit = vi.fn()
    const context = appContextFactory.build()
    context.systemEvents = { emit }
    const api = new PluginAPIImpl(context, {} as Server)
    api.setPluginContext("queue-theme", roomId)

    const a = queueItemFactory.build({ mediaSource: { type: "spotify", trackId: "a" } })
    const b = queueItemFactory.build({ mediaSource: { type: "spotify", trackId: "b" } })
    vi.mocked(findRoom).mockResolvedValue(
      roomFactory.build({ id: roomId, playbackMode: "app-controlled" }),
    )
    vi.mocked(getQueue).mockResolvedValue([a, b])
    vi.mocked(buildQueueChangedData).mockResolvedValue({
      roomId,
      queue: [a, b],
      splitKey: "spotify:b",
    })

    const result = await api.setQueueSplit(roomId, "spotify:b")
    expect(result).toEqual({ success: true })
    expect(setQueueSplit).toHaveBeenCalledWith({
      context,
      roomId,
      belowKey: "spotify:b",
    })
    expect(emit).toHaveBeenCalledWith(
      roomId,
      "QUEUE_CHANGED",
      expect.objectContaining({ splitKey: "spotify:b" }),
    )
  })

  test("rejects when not app-controlled", async () => {
    const api = new PluginAPIImpl(appContextFactory.build(), {} as Server)
    api.setPluginContext("queue-theme", roomId)
    vi.mocked(findRoom).mockResolvedValue(
      roomFactory.build({ id: roomId, playbackMode: "spotify-controlled" }),
    )

    const result = await api.setQueueSplit(roomId, "spotify:b")
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.message).toContain("app-controlled")
    }
    expect(setQueueSplit).not.toHaveBeenCalled()
  })

  test("removeQueueSplit clears and emits", async () => {
    const emit = vi.fn()
    const context = appContextFactory.build()
    context.systemEvents = { emit }
    const api = new PluginAPIImpl(context, {} as Server)
    api.setPluginContext("queue-theme", roomId)

    vi.mocked(findRoom).mockResolvedValue(
      roomFactory.build({ id: roomId, playbackMode: "app-controlled" }),
    )
    vi.mocked(buildQueueChangedData).mockResolvedValue({
      roomId,
      queue: [],
      splitKey: null,
    })

    const result = await api.removeQueueSplit(roomId)
    expect(result).toEqual({ success: true })
    expect(clearQueueSplit).toHaveBeenCalledWith({ context, roomId })
    expect(emit).toHaveBeenCalledWith(roomId, "QUEUE_CHANGED", expect.any(Object))
  })

  test("fails closed when plugin identity is unset", async () => {
    const api = new PluginAPIImpl(appContextFactory.build(), {} as Server)
    const setResult = await api.setQueueSplit(roomId, "spotify:b")
    expect(setResult).toEqual({
      success: false,
      message: "Plugin identity is required.",
    })
    expect(setQueueSplit).not.toHaveBeenCalled()

    const removeResult = await api.removeQueueSplit(roomId)
    expect(removeResult).toEqual({
      success: false,
      message: "Plugin identity is required.",
    })
    expect(clearQueueSplit).not.toHaveBeenCalled()
  })
})

describe("PluginAPIImpl.createPoll", () => {
  test("fails closed when plugin identity is unset", async () => {
    const api = new PluginAPIImpl(appContextFactory.build(), {} as Server)
    const result = await api.createPoll({
      roomId: "room-1",
      userId: "admin-1",
      question: "Q?",
      options: [{ label: "Yes" }, { label: "No" }],
    })
    expect(result).toEqual({
      ok: false,
      error: {
        status: 403,
        error: "Forbidden",
        message: "Plugin identity is required.",
      },
    })
  })

  test("fails closed on closePoll when plugin identity is unset", async () => {
    const api = new PluginAPIImpl(appContextFactory.build(), {} as Server)
    const result = await api.closePoll({
      roomId: "room-1",
      userId: "admin-1",
      pollId: "poll-1",
    })
    expect(result).toEqual({
      ok: false,
      error: {
        status: 403,
        error: "Forbidden",
        message: "Plugin identity is required.",
      },
    })
  })
})

describe("PluginAPIImpl single-user room lookups", () => {
  const roomId = "room-1"
  const userId = "user-1"

  function buildApi() {
    const emit = vi.fn()
    const to = vi.fn().mockReturnValue({ emit })
    const api = new PluginAPIImpl(appContextFactory.build(), { to } as unknown as Server)
    return { api, to, emit }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("sendUserToast", () => {
    test("resolves the socket with getOnlineUserSocketId, never getRoomUsers", async () => {
      vi.mocked(getOnlineUserSocketId).mockResolvedValue("socket-abc")
      const { api, to, emit } = buildApi()

      await api.sendUserToast(roomId, userId, { title: "Robbed", type: "error" })

      expect(getOnlineUserSocketId).toHaveBeenCalledTimes(1)
      expect(getOnlineUserSocketId).toHaveBeenCalledWith(
        expect.objectContaining({ roomId, userId }),
      )
      expect(getRoomUsers).not.toHaveBeenCalled()
      expect(to).toHaveBeenCalledWith("socket-abc")
      expect(emit).toHaveBeenCalledWith("event", {
        type: "USER_TOAST",
        data: { roomId, title: "Robbed", type: "error" },
      })
    })

    test("warns and returns without emitting when there is no connected socket", async () => {
      vi.mocked(getOnlineUserSocketId).mockResolvedValue(null)
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
      const { api, to } = buildApi()

      await api.sendUserToast(roomId, userId, { title: "Robbed" })

      expect(to).not.toHaveBeenCalled()
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("no connected socket"))
      warn.mockRestore()
    })
  })

  describe("sendUserSystemMessage", () => {
    test("resolves the socket with getOnlineUserSocketId, never getRoomUsers", async () => {
      vi.mocked(getOnlineUserSocketId).mockResolvedValue("socket-abc")
      const { api, to, emit } = buildApi()

      await api.sendUserSystemMessage(roomId, userId, "hello")

      expect(getOnlineUserSocketId).toHaveBeenCalledWith(
        expect.objectContaining({ roomId, userId }),
      )
      expect(getRoomUsers).not.toHaveBeenCalled()
      expect(to).toHaveBeenCalledWith("socket-abc")
      expect(emit).toHaveBeenCalledWith(
        "event",
        expect.objectContaining({ type: "MESSAGE_RECEIVED" }),
      )
    })
  })

  describe("queueSoundEffect", () => {
    test("user-targeted delivery uses getOnlineUserSocketId", async () => {
      vi.mocked(getOnlineUserSocketId).mockResolvedValue("socket-abc")
      const { api, to, emit } = buildApi()
      api.setPluginContext("queue-theme", roomId)

      await api.queueSoundEffect({ url: "https://example.com/ding.mp3", userId })

      expect(getOnlineUserSocketId).toHaveBeenCalledWith(
        expect.objectContaining({ roomId, userId }),
      )
      expect(getRoomUsers).not.toHaveBeenCalled()
      expect(to).toHaveBeenCalledWith("socket-abc")
      expect(emit).toHaveBeenCalledWith(
        "event",
        expect.objectContaining({ type: "SOUND_EFFECT_QUEUED" }),
      )
    })
  })

  describe("queueScreenEffect", () => {
    test("recipient-targeted delivery uses getOnlineUserSocketId", async () => {
      vi.mocked(getOnlineUserSocketId).mockResolvedValue("socket-abc")
      const { api, to, emit } = buildApi()
      api.setPluginContext("queue-theme", roomId)

      await api.queueScreenEffect({
        target: "room",
        effect: "shakeX",
        recipientUserId: userId,
      })

      expect(getOnlineUserSocketId).toHaveBeenCalledWith(
        expect.objectContaining({ roomId, userId }),
      )
      expect(getRoomUsers).not.toHaveBeenCalled()
      expect(to).toHaveBeenCalledWith("socket-abc")
      expect(emit).toHaveBeenCalledWith(
        "event",
        expect.objectContaining({ type: "SCREEN_EFFECT_QUEUED" }),
      )
    })
  })

  describe("getOnlineUserIds", () => {
    test("reads ids without hydrating the room", async () => {
      vi.mocked(getOnlineUserIds).mockResolvedValue(["a", "b"])
      const { api } = buildApi()

      await expect(api.getOnlineUserIds(roomId)).resolves.toEqual(["a", "b"])
      expect(getOnlineUserIds).toHaveBeenCalledWith(expect.objectContaining({ roomId }))
      expect(getRoomUsers).not.toHaveBeenCalled()
    })
  })

  describe("isUserInRoom", () => {
    test("is true for a connected user and reads no room-wide user list", async () => {
      vi.mocked(getOnlineUserSocketId).mockResolvedValue("socket-abc")
      const { api } = buildApi()

      await expect(api.isUserInRoom(roomId, userId)).resolves.toBe(true)
      expect(getOnlineUserSocketId).toHaveBeenCalledTimes(1)
      expect(getRoomUsers).not.toHaveBeenCalled()
    })

    test("is false when the user has no socket in the room", async () => {
      vi.mocked(getOnlineUserSocketId).mockResolvedValue(null)
      const { api } = buildApi()

      await expect(api.isUserInRoom(roomId, userId)).resolves.toBe(false)
    })
  })
})

describe("PluginAPIImpl.emit user-game-state invalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function buildContributorApi() {
    const emit = vi.fn()
    const to = vi.fn().mockReturnValue({ emit })
    const api = new PluginAPIImpl(appContextFactory.build(), { to } as unknown as Server)
    api.setPluginContext("queue-theme", "room-1", { contributesUserGameState: true })
    return { api, emit }
  }

  test("queues USER_GAME_STATE_INVALIDATED by default", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {})
    const { api, emit } = buildContributorApi()

    await api.emit("ROUND_STARTED", { roundActive: true })
    await new Promise<void>((resolve) => queueMicrotask(resolve))

    expect(emit).toHaveBeenCalledWith("event", {
      type: "USER_GAME_STATE_INVALIDATED",
      data: { roomId: "room-1", pluginName: "queue-theme" },
    })
    log.mockRestore()
  })

  test("skips invalidation when invalidatesUserState is false", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {})
    const { api, emit } = buildContributorApi()

    await api.emit("POLL_CYCLE", { roundActive: true }, { invalidatesUserState: false })
    await new Promise<void>((resolve) => queueMicrotask(resolve))

    const types = emit.mock.calls.map((call) => (call[1] as { type: string }).type)
    expect(types).toContain("PLUGIN:queue-theme:POLL_CYCLE")
    expect(types).not.toContain("USER_GAME_STATE_INVALIDATED")
    log.mockRestore()
  })
})
