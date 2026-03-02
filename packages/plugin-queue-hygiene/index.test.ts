import { describe, expect, test, vi, beforeEach, afterEach } from "vitest"
import { QueueHygienePlugin } from "./index"
import type { QueueHygieneConfig } from "./types"
import {
  PluginContext,
  PluginAPI,
  PluginStorage,
  PluginLifecycle,
  QueueItem,
  User,
  QueueValidationParams,
} from "@repo/types"

// Mock factories
function createMockQueueItem(
  trackId: string,
  userId?: string,
  addedAt?: number,
): QueueItem {
  return {
    title: `Track ${trackId}`,
    mediaSource: {
      type: "spotify",
      trackId,
    },
    track: {
      id: trackId,
      title: `Track ${trackId}`,
      artists: [{ title: "Test Artist" }],
      album: { title: "Test Album" },
    },
    addedAt: addedAt ?? Date.now(),
    addedBy: userId ? { userId, username: `User ${userId}` } : undefined,
    addedDuring: undefined,
    playedAt: undefined,
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

// Mock context factory
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
    cleanup: vi.fn().mockResolvedValue(undefined),
  }

  const mockApi: PluginAPI = {
    getNowPlaying: vi.fn().mockResolvedValue(null),
    getReactions: vi.fn().mockResolvedValue([]),
    getUsers: vi.fn().mockResolvedValue([]),
    getUsersByIds: vi.fn().mockResolvedValue([]),
    getQueue: vi.fn().mockResolvedValue([]),
    skipTrack: vi.fn().mockResolvedValue(undefined),
    sendSystemMessage: vi.fn().mockResolvedValue(undefined),
    getPluginConfig: vi.fn().mockResolvedValue(null),
    setPluginConfig: vi.fn().mockResolvedValue(undefined),
    updatePlaylistTrack: vi.fn().mockResolvedValue(undefined),
    emit: vi.fn().mockResolvedValue(undefined),
    queueSoundEffect: vi.fn().mockResolvedValue(undefined),
    queueScreenEffect: vi.fn().mockResolvedValue(undefined),
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
    getRoom: vi.fn().mockResolvedValue(null),
    appContext: {} as any,
    _lifecycleHandlers: lifecycleHandlers, // For testing purposes
  } as any
}

describe("QueueHygienePlugin", () => {
  let plugin: QueueHygienePlugin
  let mockContext: PluginContext

  beforeEach(() => {
    plugin = new QueueHygienePlugin()
    mockContext = createMockContext()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe("registration", () => {
    test("should register with correct name and version", () => {
      expect(plugin.name).toBe("queue-hygiene")
      expect(plugin.version).toBeDefined()
    })

    test("should subscribe to lifecycle events", async () => {
      await plugin.register(mockContext)

      expect(mockContext.lifecycle.on).toHaveBeenCalledWith(
        "QUEUE_CHANGED",
        expect.any(Function),
      )
      expect(mockContext.lifecycle.on).toHaveBeenCalledWith(
        "CONFIG_CHANGED",
        expect.any(Function),
      )
    })

    test("should provide config schema", () => {
      const schema = plugin.getConfigSchema()

      expect(schema).toBeDefined()
      expect(schema.jsonSchema).toBeDefined()
      expect(schema.layout).toBeInstanceOf(Array)
      expect(schema.fieldMeta).toBeDefined()
    })
  })

  describe("validateQueueRequest", () => {
    const enabledConfig: QueueHygieneConfig = {
      enabled: true,
      preventConsecutive: true,
      rateLimitEnabled: true,
      baseCooldownMs: 30000,
      maxCooldownMs: 180000,
      cooldownScalesWithDjs: true,
      cooldownScalesWithQueue: true,
      exemptAdmins: true,
    }

    const validationParams: QueueValidationParams = {
      roomId: "test-room",
      userId: "user1",
      username: "User 1",
      trackId: "track123",
    }

    beforeEach(async () => {
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue(enabledConfig)
      await plugin.register(mockContext)
    })

    test("should allow when plugin is disabled", async () => {
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue({
        ...enabledConfig,
        enabled: false,
      })

      const result = await plugin.validateQueueRequest(validationParams)

      expect(result.allowed).toBe(true)
    })

    test("should allow when user is admin and exemptAdmins is true", async () => {
      vi.mocked(mockContext.api.getUsers).mockResolvedValue([
        createMockUser("user1", { isAdmin: true }),
      ])
      // Last track was from same user (would be consecutive)
      vi.mocked(mockContext.api.getQueue).mockResolvedValue([
        createMockQueueItem("track1", "user1"),
      ])

      const result = await plugin.validateQueueRequest(validationParams)

      expect(result.allowed).toBe(true)
    })

    test("should allow when preventConsecutive is disabled", async () => {
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue({
        ...enabledConfig,
        preventConsecutive: false,
      })
      vi.mocked(mockContext.api.getUsers).mockResolvedValue([
        createMockUser("user1"),
      ])

      const result = await plugin.validateQueueRequest(validationParams)

      expect(result.allowed).toBe(true)
    })

    test("should allow when last track is from different user", async () => {
      vi.mocked(mockContext.api.getUsers).mockResolvedValue([
        createMockUser("user1"),
        createMockUser("user2"),
      ])
      // Last track was from different user
      vi.mocked(mockContext.api.getQueue).mockResolvedValue([
        createMockQueueItem("track1", "user2"),
      ])

      const result = await plugin.validateQueueRequest(validationParams)

      expect(result.allowed).toBe(true)
    })

    test("should allow when queue is empty", async () => {
      vi.mocked(mockContext.api.getUsers).mockResolvedValue([
        createMockUser("user1"),
      ])
      vi.mocked(mockContext.api.getQueue).mockResolvedValue([])

      const result = await plugin.validateQueueRequest(validationParams)

      expect(result.allowed).toBe(true)
    })

    test("should reject consecutive track when rate limiting is disabled", async () => {
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue({
        ...enabledConfig,
        rateLimitEnabled: false,
      })
      vi.mocked(mockContext.api.getUsers).mockResolvedValue([
        createMockUser("user1"),
      ])
      // Last track was from same user
      vi.mocked(mockContext.api.getQueue).mockResolvedValue([
        createMockQueueItem("track1", "user1"),
      ])

      const result = await plugin.validateQueueRequest(validationParams)

      expect(result.allowed).toBe(false)
      if (!result.allowed) {
        expect(result.reason).toContain("wait for another DJ to add a song")
      }
    })

    test("should reject when cooldown has not expired", async () => {
      vi.mocked(mockContext.api.getUsers).mockResolvedValue([
        createMockUser("user1"),
      ])
      // Last track was from same user
      vi.mocked(mockContext.api.getQueue).mockResolvedValue([
        createMockQueueItem("track1", "user1"),
      ])
      // User queued 10 seconds ago (still in cooldown)
      const tenSecondsAgo = Date.now() - 10000
      vi.mocked(mockContext.storage.get).mockResolvedValue(String(tenSecondsAgo))

      const result = await plugin.validateQueueRequest(validationParams)

      expect(result.allowed).toBe(false)
      if (!result.allowed) {
        expect(result.reason).toContain("Wait")
        expect(result.reason).toContain("another DJ to add a song")
      }
    })

    test("should allow when cooldown has expired", async () => {
      vi.mocked(mockContext.api.getUsers).mockResolvedValue([
        createMockUser("user1"),
      ])
      // Last track was from same user
      vi.mocked(mockContext.api.getQueue).mockResolvedValue([
        createMockQueueItem("track1", "user1"),
      ])
      // User queued 5 minutes ago (cooldown expired)
      const fiveMinutesAgo = Date.now() - 300000
      vi.mocked(mockContext.storage.get).mockResolvedValue(String(fiveMinutesAgo))

      const result = await plugin.validateQueueRequest(validationParams)

      expect(result.allowed).toBe(true)
    })

    test("should allow when no previous queue timestamp exists", async () => {
      vi.mocked(mockContext.api.getUsers).mockResolvedValue([
        createMockUser("user1"),
      ])
      // Last track was from same user
      vi.mocked(mockContext.api.getQueue).mockResolvedValue([
        createMockQueueItem("track1", "user1"),
      ])
      // No previous timestamp
      vi.mocked(mockContext.storage.get).mockResolvedValue(null)

      const result = await plugin.validateQueueRequest(validationParams)

      expect(result.allowed).toBe(true)
    })
  })

  describe("dynamic cooldown calculation", () => {
    const enabledConfig: QueueHygieneConfig = {
      enabled: true,
      preventConsecutive: true,
      rateLimitEnabled: true,
      baseCooldownMs: 30000, // 30 seconds
      maxCooldownMs: 180000, // 3 minutes
      cooldownScalesWithDjs: true,
      cooldownScalesWithQueue: true,
      exemptAdmins: true,
    }

    const validationParams: QueueValidationParams = {
      roomId: "test-room",
      userId: "user1",
      username: "User 1",
      trackId: "track123",
    }

    beforeEach(async () => {
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue(enabledConfig)
      await plugin.register(mockContext)
    })

    test("should use base cooldown with empty queue and few DJs", async () => {
      vi.mocked(mockContext.api.getUsers).mockResolvedValue([
        createMockUser("user1"),
      ])
      // Last track from same user (consecutive)
      vi.mocked(mockContext.api.getQueue).mockResolvedValue([
        createMockQueueItem("track1", "user1"),
      ])
      // User queued 25 seconds ago (just under base cooldown of 30s)
      const twentyFiveSecondsAgo = Date.now() - 25000
      vi.mocked(mockContext.storage.get).mockResolvedValue(
        String(twentyFiveSecondsAgo),
      )

      const result = await plugin.validateQueueRequest(validationParams)

      // Should be rejected since 25s < 30s base cooldown
      expect(result.allowed).toBe(false)
    })

    test("should scale cooldown with more DJs", async () => {
      // 10 DJs (at threshold)
      const manyDjs = Array.from({ length: 10 }, (_, i) =>
        createMockUser(`user${i}`, { isDeputyDj: true }),
      )
      vi.mocked(mockContext.api.getUsers).mockResolvedValue(manyDjs)

      // Last track from same user
      vi.mocked(mockContext.api.getQueue).mockResolvedValue([
        createMockQueueItem("track1", "user1"),
      ])

      // User queued 60 seconds ago
      // With 10 DJs and empty queue, cooldown should be higher than base
      const sixtySecondsAgo = Date.now() - 60000
      vi.mocked(mockContext.storage.get).mockResolvedValue(
        String(sixtySecondsAgo),
      )

      // Need to check behavior - with scaling, may or may not be allowed
      const result = await plugin.validateQueueRequest(validationParams)

      // With 10 DJs (ratio=1) and 1 queue item (ratio≈0.07), combined ≈0.53
      // Cooldown ≈ 30000 + 150000 * 0.53 ≈ 110000ms
      // 60 seconds < 110 seconds, so should be rejected
      expect(result.allowed).toBe(false)
    })

    test("should scale cooldown with longer queue", async () => {
      vi.mocked(mockContext.api.getUsers).mockResolvedValue([
        createMockUser("user1", { isDeputyDj: true }),
      ])

      // 15 tracks in queue (at threshold)
      const longQueue = Array.from({ length: 15 }, (_, i) =>
        createMockQueueItem(`track${i}`, i === 14 ? "user1" : `user${i}`),
      )
      vi.mocked(mockContext.api.getQueue).mockResolvedValue(longQueue)

      // User queued 2 minutes ago
      const twoMinutesAgo = Date.now() - 120000
      vi.mocked(mockContext.storage.get).mockResolvedValue(
        String(twoMinutesAgo),
      )

      const result = await plugin.validateQueueRequest(validationParams)

      // With 1 DJ (ratio≈0.1) and 15 queue items (ratio=1), combined ≈0.55
      // Cooldown ≈ 30000 + 150000 * 0.55 ≈ 112500ms
      // 120 seconds > 112 seconds, so should be allowed
      expect(result.allowed).toBe(true)
    })

    test("should use base cooldown when scaling is disabled", async () => {
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue({
        ...enabledConfig,
        cooldownScalesWithDjs: false,
        cooldownScalesWithQueue: false,
      })

      // Many DJs and long queue
      const manyDjs = Array.from({ length: 10 }, (_, i) =>
        createMockUser(`user${i}`, { isDeputyDj: true }),
      )
      vi.mocked(mockContext.api.getUsers).mockResolvedValue(manyDjs)

      const longQueue = Array.from({ length: 15 }, (_, i) =>
        createMockQueueItem(`track${i}`, i === 14 ? "user1" : `user${i}`),
      )
      vi.mocked(mockContext.api.getQueue).mockResolvedValue(longQueue)

      // User queued 35 seconds ago (just over base cooldown of 30s)
      const thirtyFiveSecondsAgo = Date.now() - 35000
      vi.mocked(mockContext.storage.get).mockResolvedValue(
        String(thirtyFiveSecondsAgo),
      )

      const result = await plugin.validateQueueRequest(validationParams)

      // With scaling disabled, should just use base cooldown of 30s
      // 35 seconds > 30 seconds, so should be allowed
      expect(result.allowed).toBe(true)
    })
  })

  describe("configChanged", () => {
    const mockConfig: QueueHygieneConfig = {
      enabled: true,
      preventConsecutive: true,
      rateLimitEnabled: true,
      baseCooldownMs: 30000,
      maxCooldownMs: 180000,
      cooldownScalesWithDjs: true,
      cooldownScalesWithQueue: true,
      exemptAdmins: true,
    }

    beforeEach(async () => {
      await plugin.register(mockContext)
    })

    test("should send system message when plugin is enabled", async () => {
      const handlers = (mockContext as any)._lifecycleHandlers.get("CONFIG_CHANGED")
      const configChangedHandler = handlers[0]

      await configChangedHandler({
        roomId: "test-room",
        pluginName: "queue-hygiene",
        config: mockConfig,
        previousConfig: { ...mockConfig, enabled: false },
      })

      expect(mockContext.api.sendSystemMessage).toHaveBeenCalledWith(
        "test-room",
        expect.stringContaining("Queue Hygiene enabled"),
        expect.any(Object),
      )
    })

    test("should send system message when plugin is disabled", async () => {
      const handlers = (mockContext as any)._lifecycleHandlers.get("CONFIG_CHANGED")
      const configChangedHandler = handlers[0]

      await configChangedHandler({
        roomId: "test-room",
        pluginName: "queue-hygiene",
        config: { ...mockConfig, enabled: false },
        previousConfig: mockConfig,
      })

      expect(mockContext.api.sendSystemMessage).toHaveBeenCalledWith(
        "test-room",
        expect.stringContaining("Queue Hygiene disabled"),
        expect.any(Object),
      )
    })

    test("should not send message when config changes but enabled state unchanged", async () => {
      const handlers = (mockContext as any)._lifecycleHandlers.get("CONFIG_CHANGED")
      const configChangedHandler = handlers[0]

      vi.mocked(mockContext.api.sendSystemMessage).mockClear()

      // Change some config but keep enabled=true
      await configChangedHandler({
        roomId: "test-room",
        pluginName: "queue-hygiene",
        config: { ...mockConfig, baseCooldownMs: 60000 },
        previousConfig: mockConfig,
      })

      expect(mockContext.api.sendSystemMessage).not.toHaveBeenCalled()
    })

    test("should ignore config changes for other plugins", async () => {
      const handlers = (mockContext as any)._lifecycleHandlers.get("CONFIG_CHANGED")
      const configChangedHandler = handlers[0]

      vi.mocked(mockContext.api.sendSystemMessage).mockClear()

      await configChangedHandler({
        roomId: "test-room",
        pluginName: "some-other-plugin",
        config: { enabled: true },
        previousConfig: { enabled: false },
      })

      expect(mockContext.api.sendSystemMessage).not.toHaveBeenCalled()
    })
  })

  describe("queueChanged - timestamp tracking", () => {
    const mockConfig: QueueHygieneConfig = {
      enabled: true,
      preventConsecutive: true,
      rateLimitEnabled: true,
      baseCooldownMs: 30000,
      maxCooldownMs: 180000,
      cooldownScalesWithDjs: true,
      cooldownScalesWithQueue: true,
      exemptAdmins: true,
    }

    beforeEach(async () => {
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue(mockConfig)
      await plugin.register(mockContext)
    })

    test("should update timestamp when new track is added", async () => {
      const handlers = (mockContext as any)._lifecycleHandlers.get("QUEUE_CHANGED")
      const queueChangedHandler = handlers[0]

      const now = Date.now()
      const newTrack = createMockQueueItem("track1", "user1", now)

      await queueChangedHandler({
        roomId: "test-room",
        queue: [newTrack],
      })

      expect(mockContext.storage.set).toHaveBeenCalledWith(
        "lastQueue:user1",
        String(now),
        expect.any(Number),
      )
    })

    test("should not update timestamp for old tracks", async () => {
      const handlers = (mockContext as any)._lifecycleHandlers.get("QUEUE_CHANGED")
      const queueChangedHandler = handlers[0]

      // Track added 10 seconds ago (not recent)
      const tenSecondsAgo = Date.now() - 10000
      const oldTrack = createMockQueueItem("track1", "user1", tenSecondsAgo)

      await queueChangedHandler({
        roomId: "test-room",
        queue: [oldTrack],
      })

      expect(mockContext.storage.set).not.toHaveBeenCalled()
    })

    test("should not update when plugin is disabled", async () => {
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue({
        ...mockConfig,
        enabled: false,
      })

      const handlers = (mockContext as any)._lifecycleHandlers.get("QUEUE_CHANGED")
      const queueChangedHandler = handlers[0]

      const now = Date.now()
      const newTrack = createMockQueueItem("track1", "user1", now)

      await queueChangedHandler({
        roomId: "test-room",
        queue: [newTrack],
      })

      expect(mockContext.storage.set).not.toHaveBeenCalled()
    })
  })

  describe("cleanup", () => {
    beforeEach(async () => {
      await plugin.register(mockContext)
    })

    test("should call storage cleanup", async () => {
      await plugin.cleanup()

      expect((mockContext.storage as any).cleanup).toHaveBeenCalled()
    })
  })
})
