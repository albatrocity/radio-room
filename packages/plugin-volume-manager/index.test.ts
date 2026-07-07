import { describe, expect, test, vi, beforeEach } from "vitest"
import { VolumeManagerPlugin } from "./index"
import { clampVolumePercent, volumeManagerConfigSchema } from "./types"
import type { PluginAPI, PluginContext, PluginLifecycle, PluginStorage } from "@repo/types"

function createMockContext(roomId = "test-room"): PluginContext {
  const lifecycleHandlers = new Map<string, Function[]>()

  const mockStorage: PluginStorage & { cleanup: () => Promise<void> } = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    inc: vi.fn().mockResolvedValue(1),
    dec: vi.fn().mockResolvedValue(0),
    del: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(false),
    mget: vi.fn().mockResolvedValue([]),
    pipeline: vi.fn().mockResolvedValue([]),
    zadd: vi.fn().mockResolvedValue(undefined),
    zrem: vi.fn().mockResolvedValue(undefined),
    zrank: vi.fn().mockResolvedValue(null),
    zrevrank: vi.fn().mockResolvedValue(null),
    zrange: vi.fn().mockResolvedValue([]),
    zrangeWithScores: vi.fn().mockResolvedValue([]),
    zrangebyscore: vi.fn().mockResolvedValue([]),
    zremrangebyscore: vi.fn().mockResolvedValue(undefined),
    zscore: vi.fn().mockResolvedValue(null),
    zincrby: vi.fn().mockResolvedValue(0),
    hget: vi.fn().mockResolvedValue(null),
    hset: vi.fn().mockResolvedValue(undefined),
    hgetall: vi.fn().mockResolvedValue({}),
    hsetnx: vi.fn().mockResolvedValue(true),
    cleanup: vi.fn().mockResolvedValue(undefined),
  }

  const mockApi: PluginAPI = {
    getNowPlaying: vi.fn().mockResolvedValue(null),
    getReactions: vi.fn().mockResolvedValue([]),
    getUsers: vi.fn().mockResolvedValue([]),
    getUsersByIds: vi.fn().mockResolvedValue([]),
    isRoomAdmin: vi.fn().mockResolvedValue(true),
    getQueue: vi.fn().mockResolvedValue([]),
    skipTrack: vi.fn().mockResolvedValue(undefined),
    sendSystemMessage: vi.fn().mockResolvedValue(undefined),
    sendUserSystemMessage: vi.fn().mockResolvedValue(undefined),
    getPluginConfig: vi.fn().mockResolvedValue(null),
    setPluginConfig: vi.fn().mockResolvedValue(undefined),
    updatePlaylistTrack: vi.fn().mockResolvedValue(undefined),
    emit: vi.fn().mockResolvedValue(undefined),
    queueSoundEffect: vi.fn().mockResolvedValue(undefined),
    queueScreenEffect: vi.fn().mockResolvedValue(undefined),
    addToTrackQueue: vi.fn().mockResolvedValue({ success: true, queuedItem: {} as never }),
    removeFromTrackQueue: vi.fn().mockResolvedValue({ success: true }),
    moveToTrackQueueTop: vi.fn().mockResolvedValue({ success: true }),
    moveToTrackQueueBottom: vi.fn().mockResolvedValue({ success: true }),
    moveTrackByPosition: vi.fn().mockResolvedValue({ success: true }),
    shuffleTrackQueue: vi.fn().mockResolvedValue({ success: true }),
    setPlaybackVolume: vi.fn().mockResolvedValue({ success: true }),
    supportsVolumeControl: vi.fn().mockResolvedValue(true),
  }

  const mockLifecycle: PluginLifecycle = {
    on: vi.fn((event: string, handler: Function) => {
      if (!lifecycleHandlers.has(event)) {
        lifecycleHandlers.set(event, [])
      }
      lifecycleHandlers.get(event)!.push(handler)
    }),
    off: vi.fn(),
  }

  return {
    roomId,
    api: mockApi,
    storage: mockStorage,
    lifecycle: mockLifecycle,
    getRoom: vi.fn(),
    appContext: {} as never,
    game: {} as never,
    inventory: {} as never,
    artifacts: {} as never,
    personas: {} as never,
    _lifecycleHandlers: lifecycleHandlers,
  } as PluginContext & { _lifecycleHandlers: Map<string, Function[]> }
}

describe("clampVolumePercent", () => {
  test("clamps to 0-100", () => {
    expect(clampVolumePercent(-5)).toBe(0)
    expect(clampVolumePercent(150.6)).toBe(100)
    expect(clampVolumePercent(42.2)).toBe(42)
  })
})

describe("volumeManagerConfigSchema", () => {
  test("accepts defaults", () => {
    const result = volumeManagerConfigSchema.safeParse({})
    expect(result.success).toBe(true)
  })
})

describe("VolumeManagerPlugin", () => {
  let plugin: VolumeManagerPlugin
  let mockContext: ReturnType<typeof createMockContext>

  beforeEach(async () => {
    plugin = new VolumeManagerPlugin()
    mockContext = createMockContext()
    await plugin.register(mockContext)
  })

  test("applies live volume on config change only when volume field changes", async () => {
    vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue({
      enabled: true,
      volume: 40,
      setOnTrackStart: false,
      startVolume: 100,
    })

    const handlers = mockContext._lifecycleHandlers.get("CONFIG_CHANGED")!
    await handlers[0]({
      roomId: "test-room",
      pluginName: "volume-manager",
      config: {
        enabled: true,
        volume: 40,
        setOnTrackStart: true,
        startVolume: 100,
      },
      previousConfig: {
        enabled: true,
        volume: 100,
        setOnTrackStart: false,
        startVolume: 100,
      },
    })

    expect(mockContext.api.setPlaybackVolume).toHaveBeenCalledWith("test-room", 40)
    expect(mockContext.api.emit).toHaveBeenCalledWith("VOLUME_CHANGED", { volume: 40 })
  })

  test("does not apply startVolume on config change", async () => {
    vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue({
      enabled: true,
      volume: 100,
      setOnTrackStart: true,
      startVolume: 0,
    })

    const handlers = mockContext._lifecycleHandlers.get("CONFIG_CHANGED")!
    await handlers[0]({
      roomId: "test-room",
      pluginName: "volume-manager",
      config: {
        enabled: true,
        volume: 100,
        setOnTrackStart: true,
        startVolume: 0,
      },
      previousConfig: {
        enabled: true,
        volume: 100,
        setOnTrackStart: true,
        startVolume: 50,
      },
    })

    expect(mockContext.api.setPlaybackVolume).not.toHaveBeenCalled()
  })

  test("applies startVolume at track start via beforePlayQueuedTrack", async () => {
    vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue({
      enabled: true,
      volume: 80,
      setOnTrackStart: true,
      startVolume: 0,
    })

    await plugin.beforePlayQueuedTrack({
      roomId: "test-room",
      item: { track: { id: "t1" } } as never,
      reason: "manual",
    })

    expect(mockContext.api.setPlaybackVolume).toHaveBeenCalledWith("test-room", 0)
    expect(mockContext.api.setPluginConfig).toHaveBeenCalledWith(
      "test-room",
      "volume-manager",
      expect.objectContaining({ volume: 0 }),
    )
    expect(mockContext.api.emit).toHaveBeenCalledWith("VOLUME_CHANGED", { volume: 0 })
  })

  test("setVolume action requires admin", async () => {
    vi.mocked(mockContext.api.isRoomAdmin).mockResolvedValue(false)
    vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue({
      enabled: true,
      volume: 100,
      setOnTrackStart: false,
      startVolume: 100,
    })

    const result = await plugin.executeAction("setVolume", { userId: "user1" }, { volume: 50 })

    expect(result).toEqual({ success: false, message: "Admin required" })
    expect(mockContext.api.setPlaybackVolume).not.toHaveBeenCalled()
  })

  test("setVolume action updates live volume", async () => {
    vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue({
      enabled: true,
      volume: 100,
      setOnTrackStart: true,
      startVolume: 0,
    })

    const result = await plugin.executeAction(
      "setVolume",
      { userId: "admin1" },
      { volume: 55 },
    )

    expect(result).toEqual({ success: true })
    expect(mockContext.api.setPlaybackVolume).toHaveBeenCalledWith("test-room", 55)
    expect(mockContext.api.setPluginConfig).toHaveBeenCalledWith(
      "test-room",
      "volume-manager",
      expect.objectContaining({ volume: 55 }),
    )
    expect(mockContext.api.emit).toHaveBeenCalledWith("VOLUME_CHANGED", { volume: 55 })
  })
})
