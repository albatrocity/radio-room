import { describe, expect, test, vi, beforeEach, afterEach } from "vitest"
import { AbsentDjPlugin } from "./index"
import type { AbsentDjConfig } from "./types"
import type {
  PluginContext,
  PluginAPI,
  PluginStorage,
  PluginLifecycle,
  QueueItem,
  User,
} from "@repo/types"

// Mock factories
function createMockQueueItem(
  trackId: string,
  title: string = "Test Track",
  addedBy?: { userId: string; username: string },
): QueueItem {
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
    addedBy: addedBy ?? undefined,
    addedDuring: undefined,
    playedAt: Date.now(),
  } as QueueItem
}

function createMockUser(userId: string, username?: string): User {
  return {
    userId,
    username: username ?? `User ${userId}`,
    status: "listening",
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
    cleanup: vi.fn().mockResolvedValue(undefined),
    mget: vi.fn().mockResolvedValue([]),
    pipeline: vi.fn().mockResolvedValue([]),
    zadd: vi.fn().mockResolvedValue(undefined),
    zrem: vi.fn().mockResolvedValue(undefined),
    zincrby: vi.fn().mockResolvedValue(0),
    zrangeWithScores: vi.fn().mockResolvedValue([]),
    zrevrangeWithScores: vi.fn().mockResolvedValue([]),
    zscore: vi.fn().mockResolvedValue(null),
    zrank: vi.fn().mockResolvedValue(null),
    zrevrank: vi.fn().mockResolvedValue(null),
    zcard: vi.fn().mockResolvedValue(0),
  }

  const mockApi: PluginAPI = {
    getNowPlaying: vi.fn().mockResolvedValue(null),
    getReactions: vi.fn().mockResolvedValue([]),
    getUsers: vi.fn().mockResolvedValue([]),
    getQueue: vi.fn().mockResolvedValue([]),
    skipTrack: vi.fn().mockResolvedValue(undefined),
    sendSystemMessage: vi.fn().mockResolvedValue(undefined),
    getPluginConfig: vi.fn().mockResolvedValue(null),
    setPluginConfig: vi.fn().mockResolvedValue(undefined),
    getUsersByIds: vi.fn().mockResolvedValue([]),
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

describe("AbsentDjPlugin", () => {
  let plugin: AbsentDjPlugin
  let mockContext: PluginContext

  beforeEach(() => {
    plugin = new AbsentDjPlugin()
    mockContext = createMockContext()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe("registration", () => {
    test("should register with correct name and version", () => {
      expect(plugin.name).toBe("absent-dj")
      expect(plugin.version).toBeDefined()
    })

    test("should subscribe to lifecycle events", async () => {
      await plugin.register(mockContext)

      expect(mockContext.lifecycle.on).toHaveBeenCalledWith("TRACK_CHANGED", expect.any(Function))
      expect(mockContext.lifecycle.on).toHaveBeenCalledWith("USER_JOINED", expect.any(Function))
      expect(mockContext.lifecycle.on).toHaveBeenCalledWith("ROOM_DELETED", expect.any(Function))
      expect(mockContext.lifecycle.on).toHaveBeenCalledWith("CONFIG_CHANGED", expect.any(Function))
    })
  })

  describe("trackChanged", () => {
    const mockConfig: AbsentDjConfig = {
      enabled: true,
      skipDelay: 30000,
      messageOnPlay: undefined,
      messageOnSkip: undefined,
      soundEffectOnSkip: false,
      soundEffectOnSkipUrl: undefined,
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

      const handlers = (mockContext as any)._lifecycleHandlers.get("TRACK_CHANGED")
      const trackChangedHandler = handlers[0]

      const track = createMockQueueItem("track1", "Test Song", {
        userId: "dj1",
        username: "DJ One",
      })

      // DJ is not in the room
      vi.mocked(mockContext.api.getUsers).mockResolvedValue([createMockUser("user2")])

      await trackChangedHandler({ roomId: "test-room", track })

      // Fast-forward time
      vi.advanceTimersByTime(30000)
      await vi.runAllTimersAsync()

      // Should not have skipped
      expect(mockContext.api.skipTrack).not.toHaveBeenCalled()
    })

    test("should not start timer when track has no addedBy user", async () => {
      const handlers = (mockContext as any)._lifecycleHandlers.get("TRACK_CHANGED")
      const trackChangedHandler = handlers[0]

      // Track without addedBy
      const track = createMockQueueItem("track1", "Test Song")

      await trackChangedHandler({ roomId: "test-room", track })

      vi.advanceTimersByTime(30000)
      await vi.runAllTimersAsync()

      expect(mockContext.api.skipTrack).not.toHaveBeenCalled()
    })

    test("should not start timer when DJ is present in room", async () => {
      const handlers = (mockContext as any)._lifecycleHandlers.get("TRACK_CHANGED")
      const trackChangedHandler = handlers[0]

      const track = createMockQueueItem("track1", "Test Song", {
        userId: "dj1",
        username: "DJ One",
      })

      // DJ IS in the room
      vi.mocked(mockContext.api.getUsers).mockResolvedValue([
        createMockUser("dj1", "DJ One"),
        createMockUser("user2"),
      ])

      await trackChangedHandler({ roomId: "test-room", track })

      vi.advanceTimersByTime(30000)
      await vi.runAllTimersAsync()

      expect(mockContext.api.skipTrack).not.toHaveBeenCalled()
    })

    test("should start timer and skip track when DJ is absent", async () => {
      const handlers = (mockContext as any)._lifecycleHandlers.get("TRACK_CHANGED")
      const trackChangedHandler = handlers[0]

      const track = createMockQueueItem("track1", "Test Song", {
        userId: "dj1",
        username: "DJ One",
      })

      // DJ is NOT in the room
      vi.mocked(mockContext.api.getUsers).mockResolvedValue([
        createMockUser("user2"),
        createMockUser("user3"),
      ])

      await trackChangedHandler({ roomId: "test-room", track })

      // Timer should not have fired yet
      expect(mockContext.api.skipTrack).not.toHaveBeenCalled()

      // Advance just before timeout
      vi.advanceTimersByTime(29999)
      expect(mockContext.api.skipTrack).not.toHaveBeenCalled()

      // Complete the timeout
      vi.advanceTimersByTime(1)
      await vi.runAllTimersAsync()

      expect(mockContext.api.skipTrack).toHaveBeenCalledWith("test-room", "track1")
    })

    test("should send messageOnPlay when configured and DJ is absent", async () => {
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue({
        ...mockConfig,
        messageOnPlay: "{{username}}'s track '{{title}}' is playing but they're not here!",
      })

      const handlers = (mockContext as any)._lifecycleHandlers.get("TRACK_CHANGED")
      const trackChangedHandler = handlers[0]

      const track = createMockQueueItem("track1", "Awesome Song", {
        userId: "dj1",
        username: "DJ One",
      })

      // DJ is NOT in the room
      vi.mocked(mockContext.api.getUsers).mockResolvedValue([createMockUser("user2")])

      await trackChangedHandler({ roomId: "test-room", track })

      expect(mockContext.api.sendSystemMessage).toHaveBeenCalledWith(
        "test-room",
        "DJ One's track 'Awesome Song' is playing but they're not here!",
        { type: "alert", status: "warning" },
      )
    })

    test("should clear previous timer when new track starts", async () => {
      const handlers = (mockContext as any)._lifecycleHandlers.get("TRACK_CHANGED")
      const trackChangedHandler = handlers[0]

      // DJ is NOT in the room for both tracks
      vi.mocked(mockContext.api.getUsers).mockResolvedValue([createMockUser("user2")])

      // First track
      const track1 = createMockQueueItem("track1", "Song 1", {
        userId: "dj1",
        username: "DJ One",
      })
      await trackChangedHandler({ roomId: "test-room", track: track1 })

      // Advance part way through timer
      vi.advanceTimersByTime(15000)

      // Second track starts (should clear first timer)
      const track2 = createMockQueueItem("track2", "Song 2", {
        userId: "dj2",
        username: "DJ Two",
      })
      await trackChangedHandler({ roomId: "test-room", track: track2 })

      // Advance another 15s - first timer would have fired at 30s total
      vi.advanceTimersByTime(15000)
      await vi.runAllTimersAsync()

      // First track should NOT have been skipped
      expect(mockContext.api.skipTrack).not.toHaveBeenCalledWith("test-room", "track1")

      // Complete the second timer
      vi.advanceTimersByTime(15000)
      await vi.runAllTimersAsync()

      // Second track SHOULD be skipped
      expect(mockContext.api.skipTrack).toHaveBeenCalledWith("test-room", "track2")
    })
  })

  describe("userJoined", () => {
    const mockConfig: AbsentDjConfig = {
      enabled: true,
      skipDelay: 30000,
      messageOnPlay: undefined,
      messageOnSkip: undefined,
      soundEffectOnSkip: false,
      soundEffectOnSkipUrl: undefined,
    }

    beforeEach(async () => {
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue(mockConfig)
      await plugin.register(mockContext)
    })

    test("should cancel timer when absent DJ returns", async () => {
      const trackChangedHandler = (mockContext as any)._lifecycleHandlers.get("TRACK_CHANGED")[0]
      const userJoinedHandler = (mockContext as any)._lifecycleHandlers.get("USER_JOINED")[0]

      const track = createMockQueueItem("track1", "Test Song", {
        userId: "dj1",
        username: "DJ One",
      })

      // DJ is NOT in the room initially
      vi.mocked(mockContext.api.getUsers).mockResolvedValue([createMockUser("user2")])

      await trackChangedHandler({ roomId: "test-room", track })

      // Advance part way through timer
      vi.advanceTimersByTime(15000)

      // DJ returns!
      await userJoinedHandler({
        roomId: "test-room",
        user: createMockUser("dj1", "DJ One"),
      })

      // Complete what would have been the timer
      vi.advanceTimersByTime(15000)
      await vi.runAllTimersAsync()

      // Track should NOT have been skipped
      expect(mockContext.api.skipTrack).not.toHaveBeenCalled()
    })

    test("should not cancel timer when different user joins", async () => {
      const trackChangedHandler = (mockContext as any)._lifecycleHandlers.get("TRACK_CHANGED")[0]
      const userJoinedHandler = (mockContext as any)._lifecycleHandlers.get("USER_JOINED")[0]

      const track = createMockQueueItem("track1", "Test Song", {
        userId: "dj1",
        username: "DJ One",
      })

      // DJ is NOT in the room
      vi.mocked(mockContext.api.getUsers).mockResolvedValue([createMockUser("user2")])

      await trackChangedHandler({ roomId: "test-room", track })

      // A different user joins
      await userJoinedHandler({
        roomId: "test-room",
        user: createMockUser("user3", "User Three"),
      })

      // Complete the timer
      vi.advanceTimersByTime(30000)
      await vi.runAllTimersAsync()

      // Track SHOULD be skipped because the DJ didn't return
      expect(mockContext.api.skipTrack).toHaveBeenCalledWith("test-room", "track1")
    })

    test("should do nothing if no active timer", async () => {
      const userJoinedHandler = (mockContext as any)._lifecycleHandlers.get("USER_JOINED")[0]

      // No track playing, no timer
      await userJoinedHandler({
        roomId: "test-room",
        user: createMockUser("dj1", "DJ One"),
      })

      // Should not throw or do anything unexpected
      expect(mockContext.api.skipTrack).not.toHaveBeenCalled()
    })
  })

  describe("configChanged", () => {
    const mockConfig: AbsentDjConfig = {
      enabled: true,
      skipDelay: 30000,
      messageOnPlay: undefined,
      messageOnSkip: undefined,
      soundEffectOnSkip: false,
      soundEffectOnSkipUrl: undefined,
    }

    beforeEach(async () => {
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue(mockConfig)
      await plugin.register(mockContext)
    })

    test("should send system message when plugin is enabled", async () => {
      const configChangedHandler = (mockContext as any)._lifecycleHandlers.get("CONFIG_CHANGED")[0]

      await configChangedHandler({
        roomId: "test-room",
        pluginName: "absent-dj",
        config: mockConfig,
        previousConfig: { ...mockConfig, enabled: false },
      })

      expect(mockContext.api.sendSystemMessage).toHaveBeenCalledWith(
        "test-room",
        expect.stringContaining("Absent DJ enabled"),
        expect.any(Object),
      )
    })

    test("should send system message when plugin is disabled", async () => {
      const configChangedHandler = (mockContext as any)._lifecycleHandlers.get("CONFIG_CHANGED")[0]

      await configChangedHandler({
        roomId: "test-room",
        pluginName: "absent-dj",
        config: { ...mockConfig, enabled: false },
        previousConfig: mockConfig,
      })

      expect(mockContext.api.sendSystemMessage).toHaveBeenCalledWith(
        "test-room",
        "👻 Absent DJ disabled",
        expect.any(Object),
      )
    })

    test("should clear timer when plugin is disabled", async () => {
      const trackChangedHandler = (mockContext as any)._lifecycleHandlers.get("TRACK_CHANGED")[0]
      const configChangedHandler = (mockContext as any)._lifecycleHandlers.get("CONFIG_CHANGED")[0]

      const track = createMockQueueItem("track1", "Test Song", {
        userId: "dj1",
        username: "DJ One",
      })

      // DJ is NOT in the room
      vi.mocked(mockContext.api.getUsers).mockResolvedValue([createMockUser("user2")])

      await trackChangedHandler({ roomId: "test-room", track })

      // Advance part way through timer
      vi.advanceTimersByTime(15000)

      // Disable the plugin
      await configChangedHandler({
        roomId: "test-room",
        pluginName: "absent-dj",
        config: { ...mockConfig, enabled: false },
        previousConfig: mockConfig,
      })

      // Complete what would have been the timer
      vi.advanceTimersByTime(15000)
      await vi.runAllTimersAsync()

      // Track should NOT have been skipped
      expect(mockContext.api.skipTrack).not.toHaveBeenCalled()
    })

    test("should start timer for current track when enabled and DJ is absent", async () => {
      const configChangedHandler = (mockContext as any)._lifecycleHandlers.get("CONFIG_CHANGED")[0]

      const nowPlaying = createMockQueueItem("track1", "Test Song", {
        userId: "dj1",
        username: "DJ One",
      })
      vi.mocked(mockContext.api.getNowPlaying).mockResolvedValue(nowPlaying)

      // DJ is NOT in the room
      vi.mocked(mockContext.api.getUsers).mockResolvedValue([createMockUser("user2")])

      await configChangedHandler({
        roomId: "test-room",
        pluginName: "absent-dj",
        config: mockConfig,
        previousConfig: { ...mockConfig, enabled: false },
      })

      // Complete the timer
      vi.advanceTimersByTime(30000)
      await vi.runAllTimersAsync()

      expect(mockContext.api.skipTrack).toHaveBeenCalledWith("test-room", "track1")
    })
  })

  describe("skip with messages and sound effects", () => {
    const mockConfig: AbsentDjConfig = {
      enabled: true,
      skipDelay: 30000,
      messageOnPlay: undefined,
      messageOnSkip: "Skipped '{{title}}' - {{username}} left the room",
      soundEffectOnSkip: true,
      soundEffectOnSkipUrl: "https://example.com/skip.mp3",
    }

    beforeEach(async () => {
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue(mockConfig)
      await plugin.register(mockContext)
    })

    test("should send messageOnSkip when track is skipped", async () => {
      const trackChangedHandler = (mockContext as any)._lifecycleHandlers.get("TRACK_CHANGED")[0]

      const track = createMockQueueItem("track1", "Awesome Song", {
        userId: "dj1",
        username: "DJ One",
      })

      // DJ is NOT in the room
      vi.mocked(mockContext.api.getUsers).mockResolvedValue([createMockUser("user2")])

      await trackChangedHandler({ roomId: "test-room", track })

      // Complete the timer
      vi.advanceTimersByTime(30000)
      await vi.runAllTimersAsync()

      expect(mockContext.api.sendSystemMessage).toHaveBeenCalledWith(
        "test-room",
        "Skipped 'Awesome Song' - DJ One left the room",
      )
    })

    test("should play sound effect when track is skipped", async () => {
      const trackChangedHandler = (mockContext as any)._lifecycleHandlers.get("TRACK_CHANGED")[0]

      const track = createMockQueueItem("track1", "Test Song", {
        userId: "dj1",
        username: "DJ One",
      })

      // DJ is NOT in the room
      vi.mocked(mockContext.api.getUsers).mockResolvedValue([createMockUser("user2")])

      await trackChangedHandler({ roomId: "test-room", track })

      // Complete the timer
      vi.advanceTimersByTime(30000)
      await vi.runAllTimersAsync()

      expect(mockContext.api.queueSoundEffect).toHaveBeenCalledWith({
        url: "https://example.com/skip.mp3",
        volume: 0.6,
      })
    })

    test("should not play sound effect when disabled", async () => {
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue({
        ...mockConfig,
        soundEffectOnSkip: false,
      })

      const trackChangedHandler = (mockContext as any)._lifecycleHandlers.get("TRACK_CHANGED")[0]

      const track = createMockQueueItem("track1", "Test Song", {
        userId: "dj1",
        username: "DJ One",
      })

      // DJ is NOT in the room
      vi.mocked(mockContext.api.getUsers).mockResolvedValue([createMockUser("user2")])

      await trackChangedHandler({ roomId: "test-room", track })

      // Complete the timer
      vi.advanceTimersByTime(30000)
      await vi.runAllTimersAsync()

      expect(mockContext.api.queueSoundEffect).not.toHaveBeenCalled()
    })
  })

  describe("cleanup", () => {
    const mockConfig: AbsentDjConfig = {
      enabled: true,
      skipDelay: 30000,
      messageOnPlay: undefined,
      messageOnSkip: undefined,
      soundEffectOnSkip: false,
      soundEffectOnSkipUrl: undefined,
    }

    beforeEach(async () => {
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue(mockConfig)
      await plugin.register(mockContext)
    })

    test("should clear active timer on cleanup", async () => {
      const trackChangedHandler = (mockContext as any)._lifecycleHandlers.get("TRACK_CHANGED")[0]

      const track = createMockQueueItem("track1", "Test Song", {
        userId: "dj1",
        username: "DJ One",
      })

      // DJ is NOT in the room
      vi.mocked(mockContext.api.getUsers).mockResolvedValue([createMockUser("user2")])

      await trackChangedHandler({ roomId: "test-room", track })

      // Cleanup
      await plugin.cleanup()

      // Advance time - timer should not fire
      vi.advanceTimersByTime(30000)
      await vi.runAllTimersAsync()

      expect(mockContext.api.skipTrack).not.toHaveBeenCalled()
    })

    test("should handle roomDeleted event", async () => {
      const roomDeletedHandler = (mockContext as any)._lifecycleHandlers.get("ROOM_DELETED")[0]

      await roomDeletedHandler({ roomId: "test-room" })

      expect((mockContext.storage as any).cleanup).toHaveBeenCalled()
    })
  })

  describe("getComponentState", () => {
    const mockConfig: AbsentDjConfig = {
      enabled: true,
      skipDelay: 30000,
      messageOnPlay: undefined,
      messageOnSkip: undefined,
      soundEffectOnSkip: false,
      soundEffectOnSkipUrl: undefined,
    }

    beforeEach(async () => {
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue(mockConfig)
      await plugin.register(mockContext)
    })

    test("should return disabled state when no context", async () => {
      const newPlugin = new AbsentDjPlugin()
      const state = await newPlugin.getComponentState()

      expect(state).toEqual({
        showCountdown: false,
        countdownStartTime: null,
        absentUsername: null,
        isSkipped: false,
      })
    })

    test("should return disabled state when plugin is disabled", async () => {
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue({
        ...mockConfig,
        enabled: false,
      })

      const state = await plugin.getComponentState()

      expect(state).toEqual({
        showCountdown: false,
        countdownStartTime: null,
        absentUsername: null,
        isSkipped: false,
      })
    })

    test("should return active countdown state when timer is running", async () => {
      const trackChangedHandler = (mockContext as any)._lifecycleHandlers.get("TRACK_CHANGED")[0]

      const track = createMockQueueItem("track1", "Test Song", {
        userId: "dj1",
        username: "DJ One",
      })

      // DJ is NOT in the room
      vi.mocked(mockContext.api.getUsers).mockResolvedValue([createMockUser("user2")])

      await trackChangedHandler({ roomId: "test-room", track })

      const state = await plugin.getComponentState()

      expect(state.showCountdown).toBe(true)
      expect(state.countdownStartTime).toBeDefined()
      expect(state.absentUsername).toBe("DJ One")
      expect(state.isSkipped).toBe(false)
    })
  })

  describe("message interpolation", () => {
    test("should interpolate username and title in messages", async () => {
      const mockConfig: AbsentDjConfig = {
        enabled: true,
        skipDelay: 30000,
        messageOnPlay: "Now playing {{title}} by {{username}}",
        messageOnSkip: undefined,
        soundEffectOnSkip: false,
        soundEffectOnSkipUrl: undefined,
      }
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue(mockConfig)
      await plugin.register(mockContext)

      const trackChangedHandler = (mockContext as any)._lifecycleHandlers.get("TRACK_CHANGED")[0]

      const track = createMockQueueItem("track1", "Cool Song", {
        userId: "dj1",
        username: "DJ Cool",
      })

      // DJ is NOT in the room
      vi.mocked(mockContext.api.getUsers).mockResolvedValue([createMockUser("user2")])

      await trackChangedHandler({ roomId: "test-room", track })

      expect(mockContext.api.sendSystemMessage).toHaveBeenCalledWith(
        "test-room",
        "Now playing Cool Song by DJ Cool",
        { type: "alert", status: "warning" },
      )
    })

    test("should handle multiple occurrences of placeholders", async () => {
      const mockConfig: AbsentDjConfig = {
        enabled: true,
        skipDelay: 30000,
        messageOnPlay: "{{username}} added {{title}}. {{username}} is not here!",
        messageOnSkip: undefined,
        soundEffectOnSkip: false,
        soundEffectOnSkipUrl: undefined,
      }
      vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue(mockConfig)
      await plugin.register(mockContext)

      const trackChangedHandler = (mockContext as any)._lifecycleHandlers.get("TRACK_CHANGED")[0]

      const track = createMockQueueItem("track1", "Test", {
        userId: "dj1",
        username: "DJ",
      })

      // DJ is NOT in the room
      vi.mocked(mockContext.api.getUsers).mockResolvedValue([createMockUser("user2")])

      await trackChangedHandler({ roomId: "test-room", track })

      expect(mockContext.api.sendSystemMessage).toHaveBeenCalledWith(
        "test-room",
        "DJ added Test. DJ is not here!",
        { type: "alert", status: "warning" },
      )
    })
  })
})
