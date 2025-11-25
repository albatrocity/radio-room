import { describe, expect, test, vi, beforeEach, afterEach } from "vitest"
import { PlaylistDemocracyPlugin } from "./index"
import type { PlaylistDemocracyConfig } from "./types"
import {
  PluginContext,
  PluginAPI,
  PluginStorage,
  PluginLifecycle,
  QueueItem,
  ReactionPayload,
  User,
  Reaction,
} from "@repo/types"

// Mock factories
function createMockQueueItem(trackId: string, title: string = "Test Track"): QueueItem {
  return {
    title,
    mediaSource: {
      type: "spotify",
      trackId,
    },
    track: {
      title,
      artists: [{ title: "Test Artist" }],
      album: { title: "Test Album" },
    },
    addedAt: Date.now(),
    addedBy: undefined,
    addedDuring: undefined,
    playedAt: undefined,
  } as QueueItem
}

function createMockReactionPayload(
  trackId: string,
  emoji: string = "thumbsup",
  userId: string = "user1",
): ReactionPayload {
  return {
    reactTo: { type: "track", id: trackId },
    emoji: {
      id: emoji,
      name: emoji,
      keywords: [emoji],
      shortcodes: emoji,
      native: "👍",
    },
    user: {
      userId,
      username: `User ${userId}`,
      status: "listening",
    },
  }
}

function createMockUser(userId: string, status: string = "listening"): User {
  return {
    userId,
    username: `User ${userId}`,
    status,
  } as User
}

function createMockReaction(userId: string, emoji: string = "thumbsup"): Reaction {
  return {
    user: userId,
    emoji: emoji,
  }
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
    cleanup: vi.fn().mockResolvedValue(undefined),
  }

  const mockApi: PluginAPI = {
    getNowPlaying: vi.fn().mockResolvedValue(null),
    getReactions: vi.fn().mockResolvedValue([]),
    getUsers: vi.fn().mockResolvedValue([]),
    skipTrack: vi.fn().mockResolvedValue(undefined),
    sendSystemMessage: vi.fn().mockResolvedValue(undefined),
    getPluginConfig: vi.fn().mockResolvedValue(null),
    setPluginConfig: vi.fn().mockResolvedValue(undefined),
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

describe("PlaylistDemocracyPlugin", () => {
  let plugin: PlaylistDemocracyPlugin
  let mockContext: PluginContext

  beforeEach(() => {
    plugin = new PlaylistDemocracyPlugin()
    mockContext = createMockContext()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe("registration", () => {
    test("should register with correct name and version", () => {
      expect(plugin.name).toBe("playlist-democracy")
      expect(plugin.version).toBeDefined()
    })

    test("should subscribe to lifecycle events", async () => {
      await plugin.register(mockContext)

      expect(mockContext.lifecycle.on).toHaveBeenCalledWith("trackChanged", expect.any(Function))
      expect(mockContext.lifecycle.on).toHaveBeenCalledWith("roomDeleted", expect.any(Function))
      expect(mockContext.lifecycle.on).toHaveBeenCalledWith("configChanged", expect.any(Function))
      expect(mockContext.lifecycle.on).toHaveBeenCalledWith("reactionAdded", expect.any(Function))
      expect(mockContext.lifecycle.on).toHaveBeenCalledWith("reactionRemoved", expect.any(Function))
    })
  })

  describe("configChanged", () => {
    const mockConfig: PlaylistDemocracyConfig = {
      enabled: true,
      reactionType: "thumbsup",
      timeLimit: 60000,
      thresholdType: "percentage",
      thresholdValue: 50,
    }

    beforeEach(async () => {
      await plugin.register(mockContext)
    })

    test("should send system message when plugin is enabled", async () => {
      const handlers = (mockContext as any)._lifecycleHandlers.get("configChanged")
      const configChangedHandler = handlers[0]

      await configChangedHandler({
        roomId: "test-room",
        config: mockConfig,
        previousConfig: { ...mockConfig, enabled: false },
      })

      expect(mockContext.api.sendSystemMessage).toHaveBeenCalledWith(
        "test-room",
        expect.stringContaining("Playlist Democracy enabled"),
      )
    })

    test("should send system message when plugin is disabled", async () => {
      const handlers = (mockContext as any)._lifecycleHandlers.get("configChanged")
      const configChangedHandler = handlers[0]

      await configChangedHandler({
        roomId: "test-room",
        config: { ...mockConfig, enabled: false },
        previousConfig: mockConfig,
      })

      expect(mockContext.api.sendSystemMessage).toHaveBeenCalledWith(
        "test-room",
        "🗳️ Playlist Democracy disabled",
      )
    })

    test("should include threshold details in enable message", async () => {
      const handlers = (mockContext as any)._lifecycleHandlers.get("configChanged")
      const configChangedHandler = handlers[0]

      await configChangedHandler({
        roomId: "test-room",
        config: mockConfig,
        previousConfig: { ...mockConfig, enabled: false },
      })

      expect(mockContext.api.sendSystemMessage).toHaveBeenCalledWith(
        "test-room",
        expect.stringContaining("50%"),
      )
      expect(mockContext.api.sendSystemMessage).toHaveBeenCalledWith(
        "test-room",
        expect.stringContaining("thumbsup"),
      )
      expect(mockContext.api.sendSystemMessage).toHaveBeenCalledWith(
        "test-room",
        expect.stringContaining("60 seconds"),
      )
    })

    test("should send system message when rules change while enabled", async () => {
      const handlers = (mockContext as any)._lifecycleHandlers.get("configChanged")
      const configChangedHandler = handlers[0]

      const updatedConfig = {
        ...mockConfig,
        thresholdValue: 75, // Changed from 50% to 75%
        timeLimit: 90000, // Changed from 60 to 90 seconds
      }

      await configChangedHandler({
        roomId: "test-room",
        config: updatedConfig,
        previousConfig: mockConfig,
      })

      expect(mockContext.api.sendSystemMessage).toHaveBeenCalledWith(
        "test-room",
        expect.stringContaining("rules updated"),
      )
      expect(mockContext.api.sendSystemMessage).toHaveBeenCalledWith(
        "test-room",
        expect.stringContaining("75%"),
      )
      expect(mockContext.api.sendSystemMessage).toHaveBeenCalledWith(
        "test-room",
        expect.stringContaining("90 seconds"),
      )
    })

    test("should not send message when rules unchanged", async () => {
      const handlers = (mockContext as any)._lifecycleHandlers.get("configChanged")
      const configChangedHandler = handlers[0]

      vi.mocked(mockContext.api.sendSystemMessage).mockClear()

      // Same config, no changes
      await configChangedHandler({
        roomId: "test-room",
        config: mockConfig,
        previousConfig: mockConfig,
      })

      expect(mockContext.api.sendSystemMessage).not.toHaveBeenCalled()
    })
  })

  describe("trackChanged", () => {
    const mockConfig: PlaylistDemocracyConfig = {
      enabled: true,
      reactionType: "thumbsup",
      timeLimit: 60000,
      thresholdType: "percentage",
      thresholdValue: 50,
    }

    beforeEach(async () => {
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue(mockConfig)
      await plugin.register(mockContext)
    })

    test("should not start timer when plugin is disabled", async () => {
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue({
        ...mockConfig,
        enabled: false,
      })

      const handlers = (mockContext as any)._lifecycleHandlers.get("trackChanged")
      const trackChangedHandler = handlers[0]

      const track = createMockQueueItem("track1", "Test Song")
      await trackChangedHandler({ roomId: "test-room", track })

      // Fast-forward time
      vi.advanceTimersByTime(60000)

      // Should not have checked reactions
      expect(mockContext.api.getReactions).not.toHaveBeenCalled()
    })

    test("should start timer when track changes and plugin is enabled", async () => {
      const handlers = (mockContext as any)._lifecycleHandlers.get("trackChanged")
      const trackChangedHandler = handlers[0]

      const track = createMockQueueItem("track1", "Test Song")
      await trackChangedHandler({ roomId: "test-room", track })

      // Timer should be active but not fired yet
      expect(mockContext.api.getReactions).not.toHaveBeenCalled()

      // Fast-forward to just before timeout
      vi.advanceTimersByTime(59999)
      expect(mockContext.api.getReactions).not.toHaveBeenCalled()

      // Complete the timeout
      vi.advanceTimersByTime(1)
      await vi.runAllTimersAsync()

      // Now threshold check should have been called
      expect(mockContext.api.getUsers).toHaveBeenCalled()
    })

    test("should handle multiple track changes", async () => {
      const handlers = (mockContext as any)._lifecycleHandlers.get("trackChanged")
      const trackChangedHandler = handlers[0]

      vi.mocked(mockContext.storage.get).mockResolvedValue("0")

      // Play through multiple tracks
      for (let i = 1; i <= 3; i++) {
        vi.mocked(mockContext.api.getUsers).mockClear()
        const track = createMockQueueItem(`track${i}`, `Song ${i}`)
        await trackChangedHandler({ roomId: "test-room", track })

        // Complete the timeout for this track
        vi.advanceTimersByTime(60000)
        await vi.runAllTimersAsync()

        // Each track should trigger exactly one threshold check
        expect(mockContext.api.getUsers).toHaveBeenCalledTimes(1)
      }
    })
  })

  describe("threshold checking", () => {
    const mockConfig: PlaylistDemocracyConfig = {
      enabled: true,
      reactionType: "thumbsup",
      timeLimit: 60000,
      thresholdType: "percentage",
      thresholdValue: 50,
    }

    beforeEach(async () => {
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue(mockConfig)
      await plugin.register(mockContext)
    })

    test("should skip track when percentage threshold is not met", async () => {
      const handlers = (mockContext as any)._lifecycleHandlers.get("trackChanged")
      const trackChangedHandler = handlers[0]

      const track = createMockQueueItem("track1", "Test Song")

      // Setup: 4 listening users, 1 vote (25% < 50%)
      vi.mocked(mockContext.api.getUsers).mockResolvedValue([
        createMockUser("user1"),
        createMockUser("user2"),
        createMockUser("user3"),
        createMockUser("user4"),
      ])
      // Mock storage to return vote count of 1
      vi.mocked(mockContext.storage.get).mockResolvedValue("1")

      await trackChangedHandler({ roomId: "test-room", track })
      vi.advanceTimersByTime(60000)
      await vi.runAllTimersAsync()

      expect(mockContext.api.skipTrack).toHaveBeenCalledWith("test-room", "track1")
      expect(mockContext.api.sendSystemMessage).toHaveBeenCalledWith(
        "test-room",
        expect.stringContaining("didn't receive enough"),
      )
      // Should show percentage in message (1 vote out of 4 users = 25%)
      expect(mockContext.api.sendSystemMessage).toHaveBeenCalledWith(
        "test-room",
        expect.stringContaining("(25% / 50%)"),
      )
    })

    test("should not skip track when percentage threshold is met", async () => {
      const handlers = (mockContext as any)._lifecycleHandlers.get("trackChanged")
      const trackChangedHandler = handlers[0]

      const track = createMockQueueItem("track1", "Test Song")

      // Setup: 4 listening users, 2 votes (50% = 50%)
      vi.mocked(mockContext.api.getUsers).mockResolvedValue([
        createMockUser("user1"),
        createMockUser("user2"),
        createMockUser("user3"),
        createMockUser("user4"),
      ])
      // Mock storage to return vote count of 2 (meets 50% threshold)
      vi.mocked(mockContext.storage.get).mockResolvedValue("2")

      await trackChangedHandler({ roomId: "test-room", track })
      vi.advanceTimersByTime(60000)
      await vi.runAllTimersAsync()

      expect(mockContext.api.skipTrack).not.toHaveBeenCalled()
    })

    test("should handle static threshold type", async () => {
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue({
        ...mockConfig,
        thresholdType: "static",
        thresholdValue: 3,
      })

      const handlers = (mockContext as any)._lifecycleHandlers.get("trackChanged")
      const trackChangedHandler = handlers[0]

      const track = createMockQueueItem("track1", "Test Song")

      // Setup: 10 users, 2 votes (2 < 3)
      vi.mocked(mockContext.api.getUsers).mockResolvedValue(
        Array.from({ length: 10 }, (_, i) => createMockUser(`user${i}`)),
      )
      // Mock storage to return vote count of 2 (below static threshold of 3)
      vi.mocked(mockContext.storage.get).mockResolvedValue("2")

      await trackChangedHandler({ roomId: "test-room", track })
      vi.advanceTimersByTime(60000)
      await vi.runAllTimersAsync()

      expect(mockContext.api.skipTrack).toHaveBeenCalledWith("test-room", "track1")
      // Should show raw count in message for static threshold (not percentage)
      expect(mockContext.api.sendSystemMessage).toHaveBeenCalledWith(
        "test-room",
        expect.stringContaining("(2 / 3)"),
      )
    })

    test("should store skip info in plugin storage", async () => {
      const handlers = (mockContext as any)._lifecycleHandlers.get("trackChanged")
      const trackChangedHandler = handlers[0]

      const track = createMockQueueItem("track1", "Test Song")

      // Setup for skip
      vi.mocked(mockContext.api.getUsers).mockResolvedValue([createMockUser("user1")])
      vi.mocked(mockContext.api.getReactions).mockResolvedValue([])

      await trackChangedHandler({ roomId: "test-room", track })
      vi.advanceTimersByTime(60000)
      await vi.runAllTimersAsync()

      expect(mockContext.storage.set).toHaveBeenCalledWith(
        expect.stringContaining("skipped:track1"),
        expect.stringContaining("trackId"),
      )
    })

    test("should handle vote count from storage", async () => {
      const handlers = (mockContext as any)._lifecycleHandlers.get("trackChanged")
      const trackChangedHandler = handlers[0]

      const track = createMockQueueItem("track1", "Test Song")

      // Setup: 2 users, 1 vote from storage
      vi.mocked(mockContext.api.getUsers).mockResolvedValue([
        createMockUser("user1"),
        createMockUser("user2"),
      ])
      // Mock storage to return vote count of 1 (meets 50% threshold for 2 users)
      vi.mocked(mockContext.storage.get).mockResolvedValue("1")

      await trackChangedHandler({ roomId: "test-room", track })
      vi.advanceTimersByTime(60000)
      await vi.runAllTimersAsync()

      // With 50% threshold and 2 users, need 1 vote. Should pass.
      expect(mockContext.api.skipTrack).not.toHaveBeenCalled()
    })

    test("should handle errors gracefully", async () => {
      const handlers = (mockContext as any)._lifecycleHandlers.get("trackChanged")
      const trackChangedHandler = handlers[0]

      const track = createMockQueueItem("track1", "Test Song")

      // Simulate API error
      vi.mocked(mockContext.api.getUsers).mockRejectedValue(new Error("API Error"))

      await trackChangedHandler({ roomId: "test-room", track })
      vi.advanceTimersByTime(60000)
      await vi.runAllTimersAsync()

      // Should not throw and should not skip
      expect(mockContext.api.skipTrack).not.toHaveBeenCalled()
    })
  })

  describe("reactionAdded and reactionRemoved", () => {
    const mockConfig: PlaylistDemocracyConfig = {
      enabled: true,
      reactionType: "thumbsup",
      timeLimit: 60000,
      thresholdType: "percentage",
      thresholdValue: 50,
    }

    beforeEach(async () => {
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue(mockConfig)
      await plugin.register(mockContext)
    })

    test("should handle reaction added for current track", async () => {
      const nowPlaying = createMockQueueItem("track1", "Test Song")
      vi.mocked(mockContext.api.getNowPlaying).mockResolvedValue(nowPlaying)

      const handlers = (mockContext as any)._lifecycleHandlers.get("reactionAdded")
      const reactionAddedHandler = handlers[0]

      const reaction = createMockReactionPayload("track1", "thumbsup", "user1")

      // Should not throw
      await expect(reactionAddedHandler({ roomId: "test-room", reaction })).resolves.not.toThrow()
    })

    test("should ignore reactions when plugin is disabled", async () => {
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue({
        ...mockConfig,
        enabled: false,
      })

      const nowPlaying = createMockQueueItem("track1", "Test Song")
      vi.mocked(mockContext.api.getNowPlaying).mockResolvedValue(nowPlaying)

      const handlers = (mockContext as any)._lifecycleHandlers.get("reactionAdded")
      const reactionAddedHandler = handlers[0]

      const reaction = createMockReactionPayload("track1", "thumbsup", "user1")
      await reactionAddedHandler({ roomId: "test-room", reaction })

      // Should not process reaction
      expect(mockContext.storage.inc).not.toHaveBeenCalled()
    })
  })

  describe("cleanup", () => {
    beforeEach(async () => {
      await plugin.register(mockContext)
    })

    test("should clear active timers on cleanup", async () => {
      const mockConfig: PlaylistDemocracyConfig = {
        enabled: true,
        reactionType: "thumbsup",
        timeLimit: 60000,
        thresholdType: "percentage",
        thresholdValue: 50,
      }
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue(mockConfig)

      const handlers = (mockContext as any)._lifecycleHandlers.get("trackChanged")
      const trackChangedHandler = handlers[0]

      // Start a timer
      const track = createMockQueueItem("track1", "Test Song")
      await trackChangedHandler({ roomId: "test-room", track })

      // Cleanup
      await plugin.cleanup()

      // Advance time - timer should not fire
      vi.advanceTimersByTime(60000)
      await vi.runAllTimersAsync()

      expect(mockContext.api.getUsers).not.toHaveBeenCalled()
    })

    test("should call storage cleanup", async () => {
      await plugin.cleanup()

      expect((mockContext.storage as any).cleanup).toHaveBeenCalled()
    })

    test("should handle roomDeleted event", async () => {
      const handlers = (mockContext as any)._lifecycleHandlers.get("roomDeleted")
      const roomDeletedHandler = handlers[0]

      await roomDeletedHandler({ roomId: "test-room" })

      expect((mockContext.storage as any).cleanup).toHaveBeenCalled()
    })
  })
})
