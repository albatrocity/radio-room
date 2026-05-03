import { describe, expect, test, vi, beforeEach, afterEach } from "vitest"
import { LoyaltyProgramPlugin } from "./index"
import type { LoyaltyProgramConfig } from "./types"
import type {
  PluginContext,
  PluginAPI,
  PluginStorage,
  PluginLifecycle,
  User,
} from "@repo/types"

function createMockUser(userId: string, overrides?: Partial<User>): User {
  return {
    userId,
    username: `User ${userId}`,
    id: "sock1",
    connectedAt: new Date(Date.UTC(2026, 0, 1)).toISOString(),
    status: "listening",
    ...overrides,
  }
}

function createMockContext(roomId: string = "room1"): PluginContext {
  const lifecycleHandlers = new Map<string, Function[]>()

  const mockStorage: PluginStorage = {
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
    zincrby: vi.fn().mockResolvedValue(0),
    zrange: vi.fn().mockResolvedValue([]),
    zrangeWithScores: vi.fn().mockResolvedValue([]),
    zrangebyscore: vi.fn().mockResolvedValue([]),
    zremrangebyscore: vi.fn().mockResolvedValue(undefined),
    zscore: vi.fn().mockResolvedValue(null),
    zrank: vi.fn().mockResolvedValue(null),
    zrevrank: vi.fn().mockResolvedValue(null),
    hget: vi.fn().mockResolvedValue(null),
    hset: vi.fn().mockResolvedValue(undefined),
    hgetall: vi.fn().mockResolvedValue({}),
    hsetnx: vi.fn().mockResolvedValue(false),
  }

  const mockApi: PluginAPI = {
    getNowPlaying: vi.fn().mockResolvedValue(null),
    getReactions: vi.fn().mockResolvedValue([]),
    getUsers: vi.fn().mockResolvedValue([]),
    getUsersByIds: vi.fn().mockResolvedValue([]),
    skipTrack: vi.fn().mockResolvedValue(undefined),
    sendSystemMessage: vi.fn().mockResolvedValue(undefined),
    sendUserSystemMessage: vi.fn().mockResolvedValue(undefined),
    getPluginConfig: vi.fn().mockResolvedValue(null),
    setPluginConfig: vi.fn().mockResolvedValue(undefined),
    updatePlaylistTrack: vi.fn().mockResolvedValue(undefined),
    getQueue: vi.fn().mockResolvedValue([]),
    emit: vi.fn().mockResolvedValue(undefined),
    queueSoundEffect: vi.fn().mockResolvedValue(undefined),
    queueScreenEffect: vi.fn().mockResolvedValue(undefined),
  }

  const mockGame = {
    getActiveSession: vi.fn().mockResolvedValue({
      id: "session1",
      roomId,
      status: "active",
      startedAt: Date.now(),
      config: {} as any,
    }),
    startSession: vi.fn(),
    endSession: vi.fn(),
    registerAttributes: vi.fn(),
    addScore: vi.fn().mockResolvedValue(10),
    setScore: vi.fn(),
    applyModifier: vi.fn(),
    removeModifier: vi.fn(),
    getUserState: vi.fn(),
    getLeaderboard: vi.fn(),
    applyTimedModifier: vi.fn(),
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
    game: mockGame,
    getRoom: vi.fn().mockResolvedValue(null),
    appContext: {} as any,
    inventory: {} as any,
    _lifecycleHandlers: lifecycleHandlers,
  } as any
}

describe("LoyaltyProgramPlugin", () => {
  let plugin: LoyaltyProgramPlugin
  let mockContext: PluginContext

  beforeEach(() => {
    plugin = new LoyaltyProgramPlugin()
    mockContext = createMockContext()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T12:30:00.000Z"))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  test("uses loyalty-program id and Loyalty Program description", () => {
    expect(plugin.name).toBe("loyalty-program")
    expect(plugin.description).toContain("Loyalty Program")
  })

  test("registers USER_JOINED and CONFIG_CHANGED", async () => {
    const cfg: LoyaltyProgramConfig = {
      enabled: true,
      intervalMinutes: 60,
      baseCoins: 2,
      scaleBonusPerInterval: 1,
      minSessionMinutes: 0,
      messageTemplate: "Hi {{username}} +{{coins}}",
    }
    vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue(cfg)

    await plugin.register(mockContext)

    expect(mockContext.lifecycle.on).toHaveBeenCalledWith("USER_JOINED", expect.any(Function))
    expect(mockContext.lifecycle.on).toHaveBeenCalledWith("CONFIG_CHANGED", expect.any(Function))
  })

  test("on tick awards coins when user present and due", async () => {
    const anchor = new Date("2026-01-01T12:00:00.000Z").getTime()
    vi.setSystemTime(new Date("2026-01-01T13:05:00.000Z"))

    const cfg: LoyaltyProgramConfig = {
      enabled: true,
      intervalMinutes: 60,
      baseCoins: 3,
      scaleBonusPerInterval: 0,
      minSessionMinutes: 0,
      messageTemplate: "{{coins}}",
    }
    vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue(cfg)

    const stored = JSON.stringify({
      sessionAnchorMs: anchor,
      intervalsPaid: 0,
      nextAwardDueMs: anchor + 60 * 60 * 1000,
      gameSessionId: "session1",
    })
    vi.mocked(mockContext.storage.get).mockResolvedValue(stored)

    const user = createMockUser("u1", {
      connectedAt: new Date(anchor).toISOString(),
    })
    vi.mocked(mockContext.api.getUsers).mockResolvedValue([user])

    await plugin.register(mockContext)

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)

    expect(mockContext.game.addScore).toHaveBeenCalledWith("u1", "coin", 3, "loyalty-program:loyalty")
    expect(mockContext.api.sendUserSystemMessage).toHaveBeenCalledWith(
      "room1",
      "u1",
      "3",
    )
  })
})
