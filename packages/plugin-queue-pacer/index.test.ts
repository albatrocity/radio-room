import { describe, expect, test, vi, beforeEach, afterEach } from "vitest"
import { QueuePacerPlugin, isActive } from "./index"
import { queuePacerConfigSchema, type QueuePacerConfig } from "./types"
import type {
  PluginContext,
  PluginAPI,
  PluginStorage,
  PluginLifecycle,
  QueueItem,
  User,
} from "@repo/types"

function createMockQueueItem(
  trackId: string,
  playedAt?: number,
  duration?: number,
): QueueItem {
  return {
    title: `Track ${trackId}`,
    mediaSource: { type: "spotify", trackId },
    track: {
      id: trackId,
      title: `Track ${trackId}`,
      artists: [{ title: "Test Artist" }],
      album: { title: "Test Album" },
      duration: duration ?? 180_000,
    },
    addedAt: Date.now(),
    addedBy: { userId: "user1", username: "User 1" },
    addedDuring: undefined,
    playedAt,
  } as QueueItem
}

function createMockUser(
  userId: string,
  options: { isAdmin?: boolean; isDeputyDj?: boolean } = {},
): User {
  return {
    userId,
    username: `User ${userId}`,
    status: "participating",
    isAdmin: options.isAdmin ?? false,
    isDeputyDj: options.isDeputyDj ?? false,
  } as User
}

function createMockContext(roomId: string = "test-room"): PluginContext {
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
    addToTrackQueue: vi.fn().mockResolvedValue({ success: true, queuedItem: {} as QueueItem }),
    removeFromTrackQueue: vi.fn().mockResolvedValue({ success: true }),
    moveToTrackQueueTop: vi.fn().mockResolvedValue({ success: true }),
    moveToTrackQueueBottom: vi.fn().mockResolvedValue({ success: true }),
    moveTrackByPosition: vi.fn().mockResolvedValue({ success: true }),
    shuffleTrackQueue: vi.fn().mockResolvedValue({ success: true }),
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
    getRoom: vi.fn().mockResolvedValue({ fetchMeta: true }),
    appContext: {} as any,
    game: {} as any,
    inventory: {} as any,
    artifacts: {} as any,
    personas: {} as any,
    _lifecycleHandlers: lifecycleHandlers,
  } as any
}

describe("QueuePacerPlugin", () => {
  let plugin: QueuePacerPlugin
  let mockContext: PluginContext

  beforeEach(() => {
    plugin = new QueuePacerPlugin()
    mockContext = createMockContext()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-08T12:00:00Z"))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe("isActive helper", () => {
    test("returns false when config is null", () => {
      expect(isActive(null)).toBe(false)
    })

    test("returns false when enabled is false", () => {
      expect(isActive({ enabled: false, endTime: Date.now() + 60000, minPlaybackMs: 30000, warnOnOverrun: true })).toBe(false)
    })

    test("returns false when endTime is null", () => {
      expect(isActive({ enabled: true, endTime: null, minPlaybackMs: 30000, warnOnOverrun: true })).toBe(false)
    })

    test("returns false when endTime is in the past (beyond grace period)", () => {
      const pastTime = Date.now() - 120_000 // 2 minutes ago
      expect(isActive({ enabled: true, endTime: pastTime, minPlaybackMs: 30000, warnOnOverrun: true })).toBe(false)
    })

    test("returns true when enabled with future endTime", () => {
      const futureTime = Date.now() + 300_000 // 5 minutes from now
      expect(isActive({ enabled: true, endTime: futureTime, minPlaybackMs: 30000, warnOnOverrun: true })).toBe(true)
    })

    test("returns true within grace period after endTime", () => {
      const recentPast = Date.now() - 30_000 // 30 seconds ago (within 60s grace)
      expect(isActive({ enabled: true, endTime: recentPast, minPlaybackMs: 30000, warnOnOverrun: true })).toBe(true)
    })
  })

  describe("Zod validation", () => {
    test("accepts valid disabled config", () => {
      const result = queuePacerConfigSchema.safeParse({
        enabled: false,
        endTime: null,
        minPlaybackMs: 30000,
        warnOnOverrun: true,
      })
      expect(result.success).toBe(true)
    })

    test("accepts valid enabled config with future endTime", () => {
      const futureTime = Date.now() + 120_000
      const result = queuePacerConfigSchema.safeParse({
        enabled: true,
        endTime: futureTime,
        minPlaybackMs: 30000,
        warnOnOverrun: true,
      })
      expect(result.success).toBe(true)
    })

    test("rejects enabled config without endTime", () => {
      const result = queuePacerConfigSchema.safeParse({
        enabled: true,
        endTime: null,
        minPlaybackMs: 30000,
        warnOnOverrun: true,
      })
      expect(result.success).toBe(false)
    })

    test("rejects enabled config with past endTime", () => {
      const pastTime = Date.now() - 60_000
      const result = queuePacerConfigSchema.safeParse({
        enabled: true,
        endTime: pastTime,
        minPlaybackMs: 30000,
        warnOnOverrun: true,
      })
      expect(result.success).toBe(false)
    })
  })

  describe("registration", () => {
    test("registers with correct name and version", () => {
      expect(plugin.name).toBe("queue-pacer")
      expect(plugin.version).toBeDefined()
    })

    test("subscribes to lifecycle events", async () => {
      await plugin.register(mockContext)

      expect(mockContext.lifecycle.on).toHaveBeenCalledWith("TRACK_CHANGED", expect.any(Function))
      expect(mockContext.lifecycle.on).toHaveBeenCalledWith("QUEUE_CHANGED", expect.any(Function))
      expect(mockContext.lifecycle.on).toHaveBeenCalledWith("PLAYBACK_STATE_CHANGED", expect.any(Function))
      expect(mockContext.lifecycle.on).toHaveBeenCalledWith("ROOM_SETTINGS_UPDATED", expect.any(Function))
      expect(mockContext.lifecycle.on).toHaveBeenCalledWith("CONFIG_CHANGED", expect.any(Function))
    })

    test("provides config schema", () => {
      const schema = plugin.getConfigSchema()
      expect(schema).toBeDefined()
      expect(schema.jsonSchema).toBeDefined()
      expect(schema.layout).toBeInstanceOf(Array)
      expect(schema.fieldMeta).toBeDefined()
    })

    test("provides component schema", () => {
      const schema = plugin.getComponentSchema()
      expect(schema).toBeDefined()
      expect(schema.components).toBeInstanceOf(Array)
      expect(schema.storeKeys).toBeInstanceOf(Array)
    })
  })

  describe("getComponentState", () => {
    let enabledConfig: QueuePacerConfig

    beforeEach(async () => {
      enabledConfig = {
        enabled: true,
        endTime: Date.now() + 300_000,
        minPlaybackMs: 30_000,
        warnOnOverrun: true,
      }
      await plugin.register(mockContext)
    })

    test("returns disabled state when plugin is not active", async () => {
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue({ enabled: false, endTime: null, minPlaybackMs: 30000, warnOnOverrun: true })

      const state = await plugin.getComponentState()

      expect(state.enabled).toBe(false)
      expect(state.isPaused).toBe(false)
      expect(state.currentTrackSkipCanceled).toBe(false)
      expect(state.trackExceedsBudget).toBe(false)
    })

    test("returns active state when plugin is active with now playing", async () => {
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue(enabledConfig)
      vi.mocked(mockContext.api.getNowPlaying).mockResolvedValue(createMockQueueItem("track1", Date.now()))
      vi.mocked(mockContext.api.getQueue).mockResolvedValue([createMockQueueItem("track2")])

      const state = await plugin.getComponentState()

      expect(state.enabled).toBe(true)
      expect(state.trackStartTime).toBeDefined()
      expect(state.perTrackWindowMs).toBeDefined()
    })

    test("returns trackExceedsBudget false when track duration fits within window", async () => {
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue(enabledConfig)
      // 5 min remaining / 2 tracks = 150s window; track is 60s
      vi.mocked(mockContext.api.getNowPlaying).mockResolvedValue(
        createMockQueueItem("track1", Date.now(), 60_000),
      )
      vi.mocked(mockContext.api.getQueue).mockResolvedValue([createMockQueueItem("track2")])

      const state = await plugin.getComponentState()

      expect(state.trackExceedsBudget).toBe(false)
      expect(state.skipAmountMs).toBe(0)
    })

    test("returns skipAmountMs 0 when track duration fits within window", async () => {
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue(enabledConfig)
      vi.mocked(mockContext.api.getNowPlaying).mockResolvedValue(
        createMockQueueItem("track1", Date.now(), 60_000),
      )
      vi.mocked(mockContext.api.getQueue).mockResolvedValue([createMockQueueItem("track2")])

      const state = await plugin.getComponentState()

      expect(state.skipAmountMs).toBe(0)
    })

    test("returns trackExceedsBudget true when track duration exceeds window", async () => {
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue(enabledConfig)
      // 5 min remaining / 2 tracks = 150s window; track is 5 min
      vi.mocked(mockContext.api.getNowPlaying).mockResolvedValue(
        createMockQueueItem("track1", Date.now(), 300_000),
      )
      vi.mocked(mockContext.api.getQueue).mockResolvedValue([createMockQueueItem("track2")])

      const state = await plugin.getComponentState()

      expect(state.trackExceedsBudget).toBe(true)
      // 5 min track - 150s window = 150s skip
      expect(state.skipAmountMs).toBe(150_000)
      expect(state.hasQueuedTracksBehind).toBe(true)
    })

    test("returns hasQueuedTracksBehind false when queue is empty", async () => {
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue(enabledConfig)
      vi.mocked(mockContext.api.getNowPlaying).mockResolvedValue(
        createMockQueueItem("track1", Date.now(), 300_000),
      )
      vi.mocked(mockContext.api.getQueue).mockResolvedValue([])

      const state = await plugin.getComponentState()

      expect(state.hasQueuedTracksBehind).toBe(false)
    })
  })

  describe("activation via CONFIG_CHANGED", () => {
    const enabledConfig: QueuePacerConfig = {
      enabled: true,
      endTime: Date.now() + 300_000,
      minPlaybackMs: 30_000,
      warnOnOverrun: true,
    }

    beforeEach(async () => {
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue(enabledConfig)
      vi.mocked(mockContext.api.getNowPlaying).mockResolvedValue(createMockQueueItem("track1", Date.now()))
      vi.mocked(mockContext.api.getQueue).mockResolvedValue([])
      await plugin.register(mockContext)
    })

    test("emits ACTIVATED when transitioning from disabled to enabled", async () => {
      const handlers = (mockContext as any)._lifecycleHandlers.get("CONFIG_CHANGED")
      const configChangedHandler = handlers[0]

      await configChangedHandler({
        roomId: "test-room",
        pluginName: "queue-pacer",
        config: enabledConfig,
        previousConfig: { enabled: false, endTime: null, minPlaybackMs: 30000, warnOnOverrun: true },
      })

      expect(mockContext.api.emit).toHaveBeenCalledWith("ACTIVATED", expect.any(Object))
      expect(mockContext.api.sendSystemMessage).toHaveBeenCalledWith(
        "test-room",
        expect.stringContaining("Queue Pacer activated"),
        expect.any(Object),
      )
    })

    test("formats activation time in configured timezone", async () => {
      const endTime = new Date("2026-06-08T20:15:00Z").getTime()
      const configWithTz: QueuePacerConfig = {
        enabled: true,
        endTime,
        endTimeZone: "America/Chicago",
        minPlaybackMs: 30_000,
        warnOnOverrun: true,
      }

      const handlers = (mockContext as any)._lifecycleHandlers.get("CONFIG_CHANGED")
      const configChangedHandler = handlers[0]

      await configChangedHandler({
        roomId: "test-room",
        pluginName: "queue-pacer",
        config: configWithTz,
        previousConfig: {
          enabled: false,
          endTime: null,
          endTimeZone: null,
          minPlaybackMs: 30_000,
          warnOnOverrun: true,
        },
      })

      expect(mockContext.api.sendSystemMessage).toHaveBeenCalledWith(
        "test-room",
        expect.stringContaining("3:15 PM"),
        expect.any(Object),
      )
    })

    test("emits DEACTIVATED when transitioning from enabled to disabled", async () => {
      const handlers = (mockContext as any)._lifecycleHandlers.get("CONFIG_CHANGED")
      const configChangedHandler = handlers[0]

      await configChangedHandler({
        roomId: "test-room",
        pluginName: "queue-pacer",
        config: { enabled: false, endTime: null, minPlaybackMs: 30000, warnOnOverrun: true },
        previousConfig: enabledConfig,
      })

      expect(mockContext.api.emit).toHaveBeenCalledWith("DEACTIVATED", {})
      expect(mockContext.api.sendSystemMessage).toHaveBeenCalledWith(
        "test-room",
        expect.stringContaining("deactivated"),
        expect.any(Object),
      )
    })
  })

  describe("fetchMeta gating", () => {
    const enabledConfig: QueuePacerConfig = {
      enabled: true,
      endTime: Date.now() + 300_000,
      minPlaybackMs: 30_000,
      warnOnOverrun: true,
    }

    beforeEach(async () => {
      await plugin.register(mockContext)
    })

    test("rejects activation when fetchMeta is off", async () => {
      vi.mocked(mockContext.getRoom).mockResolvedValue({ fetchMeta: false } as any)
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue(enabledConfig)

      const handlers = (mockContext as any)._lifecycleHandlers.get("CONFIG_CHANGED")
      const configChangedHandler = handlers[0]

      await configChangedHandler({
        roomId: "test-room",
        pluginName: "queue-pacer",
        config: enabledConfig,
        previousConfig: { enabled: false, endTime: null, minPlaybackMs: 30000, warnOnOverrun: true },
      })

      expect(mockContext.api.sendSystemMessage).toHaveBeenCalledWith(
        "test-room",
        expect.stringContaining("Track Detection is off"),
        expect.any(Object),
      )
      expect(mockContext.api.setPluginConfig).toHaveBeenCalledWith(
        "test-room",
        "queue-pacer",
        expect.objectContaining({ enabled: false }),
      )
    })

    test("auto-disables when fetchMeta is turned off", async () => {
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue(enabledConfig)

      const handlers = (mockContext as any)._lifecycleHandlers.get("ROOM_SETTINGS_UPDATED")
      const roomSettingsHandler = handlers[0]

      await roomSettingsHandler({
        roomId: "test-room",
        room: { fetchMeta: false },
      })

      expect(mockContext.api.sendSystemMessage).toHaveBeenCalledWith(
        "test-room",
        expect.stringContaining("Track Detection was turned off"),
        expect.any(Object),
      )
      expect(mockContext.api.setPluginConfig).toHaveBeenCalledWith(
        "test-room",
        "queue-pacer",
        expect.objectContaining({ enabled: false }),
      )
    })
  })

  describe("TRACK_CHANGED re-arms timer", () => {
    const enabledConfig: QueuePacerConfig = {
      enabled: true,
      endTime: Date.now() + 300_000,
      minPlaybackMs: 30_000,
      warnOnOverrun: true,
    }

    beforeEach(async () => {
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue(enabledConfig)
      vi.mocked(mockContext.api.getNowPlaying).mockResolvedValue(createMockQueueItem("track1", Date.now()))
      vi.mocked(mockContext.api.getQueue).mockResolvedValue([createMockQueueItem("track2")])
      await plugin.register(mockContext)
    })

    test("resets cancel flag and re-arms on track change", async () => {
      const handlers = (mockContext as any)._lifecycleHandlers.get("TRACK_CHANGED")
      const trackChangedHandler = handlers[0]

      await trackChangedHandler({
        roomId: "test-room",
        track: createMockQueueItem("track2", Date.now()),
      })

      expect(mockContext.api.emit).toHaveBeenCalledWith("WINDOW_RECOMPUTED", expect.any(Object))
    })
  })

  describe("timer skip behavior", () => {
    const enabledConfig: QueuePacerConfig = {
      enabled: true,
      endTime: Date.now() + 10_000, // Very short time
      minPlaybackMs: 5_000,
      warnOnOverrun: true,
    }

    beforeEach(async () => {
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue(enabledConfig)
      await plugin.register(mockContext)
    })

    test("skips track when timer fires and queue has items", async () => {
      vi.mocked(mockContext.api.getNowPlaying).mockResolvedValue(createMockQueueItem("track1", Date.now()))
      vi.mocked(mockContext.api.getQueue).mockResolvedValue([createMockQueueItem("track2")])

      const handlers = (mockContext as any)._lifecycleHandlers.get("CONFIG_CHANGED")
      const configChangedHandler = handlers[0]

      await configChangedHandler({
        roomId: "test-room",
        pluginName: "queue-pacer",
        config: enabledConfig,
        previousConfig: { enabled: false, endTime: null, minPlaybackMs: 30000, warnOnOverrun: true },
      })

      await vi.runAllTimersAsync()

      expect(mockContext.api.skipTrack).toHaveBeenCalledWith("test-room", "track1")
      expect(mockContext.api.emit).toHaveBeenCalledWith("TRACK_SKIPPED", expect.any(Object))
    })

    test("does not double-skip when QUEUE_CHANGED re-enters while nowPlaying is still the skipped track", async () => {
      // Mirrors PluginAPI.skipTrack: QUEUE_CHANGED is emitted after popping the next
      // track, but Redis nowPlaying still shows the skipped track until TRACK_CHANGED.
      const track1Start = Date.now() - 120_000
      const track1 = createMockQueueItem("track1", track1Start, 180_000)
      const track2 = createMockQueueItem("track2")
      const track3 = createMockQueueItem("track3")

      vi.mocked(mockContext.api.getNowPlaying).mockResolvedValue(track1)
      vi.mocked(mockContext.api.getQueue).mockResolvedValue([track2, track3])

      vi.mocked(mockContext.api.skipTrack).mockImplementation(async () => {
        vi.mocked(mockContext.api.getQueue).mockResolvedValue([track3])
        const queueHandlers = (mockContext as any)._lifecycleHandlers.get("QUEUE_CHANGED")
        await queueHandlers[0]({
          roomId: "test-room",
          queue: [track3],
        })
        // nowPlaying intentionally remains track1 (stale metadata lag)
      })

      const handlers = (mockContext as any)._lifecycleHandlers.get("CONFIG_CHANGED")
      await handlers[0]({
        roomId: "test-room",
        pluginName: "queue-pacer",
        config: enabledConfig,
        previousConfig: { enabled: false, endTime: null, minPlaybackMs: 30000, warnOnOverrun: true },
      })

      // With the in-flight guard, QUEUE_CHANGED during skip must not schedule another timer,
      // so runAllTimersAsync completes after the single skip.
      await vi.runAllTimersAsync()

      expect(mockContext.api.skipTrack).toHaveBeenCalledTimes(1)
      expect(mockContext.api.skipTrack).toHaveBeenCalledWith("test-room", "track1")

      // Advance past MIN_TIMER_MS — must not re-skip track1 while nowPlaying is stale
      await vi.advanceTimersByTimeAsync(6_000)

      const skipCalls = vi.mocked(mockContext.api.skipTrack).mock.calls.map((c) => c[1])

      expect(skipCalls.filter((id) => id === "track1").length).toBe(1)
      expect(mockContext.api.skipTrack).toHaveBeenCalledTimes(1)

      // TRACK_CHANGED for the dispatched next track should clear the guard and arm track2
      const track2Playing = createMockQueueItem("track2", Date.now(), 180_000)
      vi.mocked(mockContext.api.getNowPlaying).mockResolvedValue(track2Playing)
      vi.mocked(mockContext.api.getQueue).mockResolvedValue([track3])
      const trackHandlers = (mockContext as any)._lifecycleHandlers.get("TRACK_CHANGED")
      await trackHandlers[0]({
        roomId: "test-room",
        track: track2Playing,
      })

      expect(mockContext.api.emit).toHaveBeenCalledWith(
        "WINDOW_RECOMPUTED",
        expect.objectContaining({ currentTrackId: "track2" }),
      )
    })

    test("ignores duplicate timer fire while skip is in flight", async () => {
      const track1 = createMockQueueItem("track1", Date.now(), 180_000)
      const track2 = createMockQueueItem("track2")

      vi.mocked(mockContext.api.getNowPlaying).mockResolvedValue(track1)
      vi.mocked(mockContext.api.getQueue).mockResolvedValue([track2])
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue(enabledConfig)

      await plugin.register(mockContext)
      ;(plugin as any).skipInFlightTrackId = "track1"

      await (plugin as any).handleTimerFire("track1")

      expect(mockContext.api.skipTrack).not.toHaveBeenCalled()
    })

    test("does not skip last track (emits LET_IT_FINISH)", async () => {
      vi.mocked(mockContext.api.getNowPlaying).mockResolvedValue(createMockQueueItem("track1", Date.now()))
      vi.mocked(mockContext.api.getQueue).mockResolvedValue([]) // Empty queue - last track

      const handlers = (mockContext as any)._lifecycleHandlers.get("CONFIG_CHANGED")
      const configChangedHandler = handlers[0]

      await configChangedHandler({
        roomId: "test-room",
        pluginName: "queue-pacer",
        config: enabledConfig,
        previousConfig: { enabled: false, endTime: null, minPlaybackMs: 30000, warnOnOverrun: true },
      })

      await vi.runAllTimersAsync()

      expect(mockContext.api.skipTrack).not.toHaveBeenCalled()
      expect(mockContext.api.emit).toHaveBeenCalledWith("LET_IT_FINISH", expect.objectContaining({ reason: "last_track" }))
    })
  })

  describe("PLAYBACK_STATE_CHANGED pause/resume", () => {
    const enabledConfig: QueuePacerConfig = {
      enabled: true,
      endTime: Date.now() + 300_000,
      minPlaybackMs: 30_000,
      warnOnOverrun: true,
    }

    beforeEach(async () => {
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue(enabledConfig)
      vi.mocked(mockContext.api.getNowPlaying).mockResolvedValue(createMockQueueItem("track1", Date.now()))
      vi.mocked(mockContext.api.getQueue).mockResolvedValue([createMockQueueItem("track2")])
      await plugin.register(mockContext)

      const configHandlers = (mockContext as any)._lifecycleHandlers.get("CONFIG_CHANGED")
      await configHandlers[0]({
        roomId: "test-room",
        pluginName: "queue-pacer",
        config: enabledConfig,
        previousConfig: { enabled: false, endTime: null, minPlaybackMs: 30000, warnOnOverrun: true },
      })
    })

    test("freezes timer on pause", async () => {
      const handlers = (mockContext as any)._lifecycleHandlers.get("PLAYBACK_STATE_CHANGED")
      const playbackHandler = handlers[0]

      await playbackHandler({
        roomId: "test-room",
        state: "paused",
        trackId: "track1",
      })

      expect(mockContext.api.emit).toHaveBeenCalledWith("PAUSED", expect.objectContaining({ isPaused: true }))
    })

    test("resumes timer on play", async () => {
      const handlers = (mockContext as any)._lifecycleHandlers.get("PLAYBACK_STATE_CHANGED")
      const playbackHandler = handlers[0]

      await playbackHandler({
        roomId: "test-room",
        state: "paused",
        trackId: "track1",
      })

      vi.mocked(mockContext.api.emit).mockClear()

      await playbackHandler({
        roomId: "test-room",
        state: "playing",
        trackId: "track1",
      })

      expect(mockContext.api.emit).toHaveBeenCalledWith("RESUMED", expect.objectContaining({ isPaused: false }))
    })
  })

  describe("cancelCurrentTrackSkip action", () => {
    const enabledConfig: QueuePacerConfig = {
      enabled: true,
      endTime: Date.now() + 300_000,
      minPlaybackMs: 30_000,
      warnOnOverrun: true,
    }

    beforeEach(async () => {
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue(enabledConfig)
      vi.mocked(mockContext.api.getNowPlaying).mockResolvedValue(createMockQueueItem("track1", Date.now()))
      vi.mocked(mockContext.api.getQueue).mockResolvedValue([createMockQueueItem("track2")])
      await plugin.register(mockContext)

      const configHandlers = (mockContext as any)._lifecycleHandlers.get("CONFIG_CHANGED")
      await configHandlers[0]({
        roomId: "test-room",
        pluginName: "queue-pacer",
        config: enabledConfig,
        previousConfig: { enabled: false, endTime: null, minPlaybackMs: 30000, warnOnOverrun: true },
      })
    })

    test("rejects non-admin users", async () => {
      vi.mocked(mockContext.api.getUsers).mockResolvedValue([createMockUser("user1", { isAdmin: false })])

      const result = await plugin.executeAction("cancelCurrentTrackSkip", { userId: "user1" })

      expect(result.success).toBe(false)
      expect(result.message).toContain("admin")
    })

    test("succeeds for admin users", async () => {
      vi.mocked(mockContext.api.getUsers).mockResolvedValue([createMockUser("admin1", { isAdmin: true })])

      const result = await plugin.executeAction("cancelCurrentTrackSkip", { userId: "admin1" })

      expect(result.success).toBe(true)
      expect(mockContext.api.emit).toHaveBeenCalledWith("SKIP_CANCELED", expect.any(Object))
    })

    test("rejects when no initiator provided", async () => {
      const result = await plugin.executeAction("cancelCurrentTrackSkip", undefined)

      expect(result.success).toBe(false)
      expect(result.message).toContain("No initiator")
    })
  })
})
