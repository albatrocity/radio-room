import { describe, expect, test, vi, beforeEach, afterEach } from "vitest"
import { TheFedPlugin } from "./index"
import { defaultTheFedConfig, type TheFedConfig } from "./types"
import type {
  PluginContext,
  PluginAPI,
  PluginStorage,
  PluginLifecycle,
} from "@repo/types"

function createMockContext(roomId: string = "room1"): PluginContext {
  const lifecycleHandlers = new Map<string, Function[]>()
  const store = new Map<string, string>()

  const mockStorage: PluginStorage = {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value)
    }),
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
    isRoomAdmin: vi.fn().mockResolvedValue(true),
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
  } as unknown as PluginAPI

  const mockGame = {
    getActiveSession: vi.fn().mockResolvedValue({
      id: "session1",
      roomId,
      status: "active",
      startedAt: Date.now(),
      config: { economy: { costScale: 1, earnScale: 1 } },
    }),
    startSession: vi.fn(),
    endSession: vi.fn(),
    registerAttributes: vi.fn(),
    addScore: vi.fn(),
    addScores: vi.fn(),
    setScore: vi.fn(),
    applyModifier: vi.fn(),
    removeModifier: vi.fn(),
    getUserState: vi.fn(),
    getLeaderboard: vi.fn(),
    applyTimedModifier: vi.fn(),
    getEconomyScale: vi.fn().mockResolvedValue({
      costScale: 1,
      earnScale: 1,
      scaledAttributes: ["coin"],
      priceRounding: 1,
      updatedAt: Date.now(),
    }),
    setEconomyScale: vi.fn().mockResolvedValue({
      costScale: 1.1,
      earnScale: 1,
      scaledAttributes: ["coin"],
      priceRounding: 1,
      updatedAt: Date.now(),
    }),
    getEconomySnapshot: vi.fn().mockResolvedValue({
      sessionId: "session1",
      balances: [1000, 1000, 1000],
    }),
  }

  const mockInventory = {
    getAllItemDefinitions: vi.fn().mockResolvedValue([
      { coinValue: 10 },
      { coinValue: 25 },
      { coinValue: 50 },
    ]),
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
    inventory: mockInventory,
    getRoom: vi.fn().mockResolvedValue(null),
    appContext: {} as any,
    _lifecycleHandlers: lifecycleHandlers,
    _store: store,
  } as any
}

async function emitLifecycle(
  context: PluginContext,
  event: string,
  data: unknown,
): Promise<void> {
  const handlers = (context as any)._lifecycleHandlers.get(event) as Function[] | undefined
  for (const handler of handlers ?? []) {
    await handler(data)
  }
}

describe("TheFedPlugin", () => {
  let plugin: TheFedPlugin
  let mockContext: PluginContext

  beforeEach(() => {
    plugin = new TheFedPlugin()
    mockContext = createMockContext()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-04T12:00:00.000Z"))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  test("uses the-fed id and The Fed description", () => {
    expect(plugin.name).toBe("the-fed")
    expect(plugin.description).toContain("The Fed")
  })

  test("observe mode never calls setEconomyScale", async () => {
    const cfg: TheFedConfig = {
      ...defaultTheFedConfig,
      enabled: true,
      mode: "observe",
      tickSeconds: 60,
    }
    vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue(cfg)

    await plugin.register(mockContext)
    const result = await plugin.executeAction("forceTick", { userId: "admin" })

    expect(result.success).toBe(true)
    expect(mockContext.game.setEconomyScale).not.toHaveBeenCalled()
    expect(mockContext.api.emit).toHaveBeenCalledWith(
      "TICK",
      expect.objectContaining({
        mode: "observe",
        acted: false,
        reason: "observed",
      }),
      { invalidatesUserState: false },
    )
  })

  test("accumulates coin flow from GAME_STATE_CHANGED", async () => {
    const cfg: TheFedConfig = {
      ...defaultTheFedConfig,
      enabled: true,
      mode: "observe",
    }
    vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue(cfg)

    await plugin.register(mockContext)

    await emitLifecycle(mockContext, "GAME_STATE_CHANGED", {
      roomId: "room1",
      sessionId: "session1",
      userId: "u1",
      changes: [{ attribute: "coin", previousValue: 10, value: 25 }],
    })
    await emitLifecycle(mockContext, "GAME_STATE_CHANGED", {
      roomId: "room1",
      sessionId: "session1",
      userId: "u2",
      changes: [
        { attribute: "score", previousValue: 0, value: 5 },
        { attribute: "coin", previousValue: 40, value: 30 },
      ],
    })

    const raw = await mockContext.storage.get("flow")
    expect(raw).toBeTruthy()
    const flow = JSON.parse(raw!)
    // +15 then −10
    expect(flow.netCoinFlow).toBe(5)
    expect(flow.sessionId).toBe("session1")
  })

  test("adjust mode calls setEconomyScale when the controller acts", async () => {
    const cfg: TheFedConfig = {
      ...defaultTheFedConfig,
      enabled: true,
      mode: "adjust",
      minParticipants: 3,
      targetAffordability: 3,
    }
    vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue(cfg)

    await plugin.register(mockContext)
    await plugin.executeAction("forceTick", { userId: "admin" })

    expect(mockContext.game.setEconomyScale).toHaveBeenCalledWith(
      { costScale: expect.any(Number) },
      expect.stringMatching(/^the-fed:/),
    )
  })

  test("adjust mode holds when fewer than minParticipants have balances", async () => {
    const cfg: TheFedConfig = {
      ...defaultTheFedConfig,
      enabled: true,
      mode: "adjust",
      minParticipants: 3,
    }
    vi.mocked(mockContext.api.getPluginConfig).mockResolvedValue(cfg)
    vi.mocked(mockContext.game.getEconomySnapshot).mockResolvedValue({
      sessionId: "session1",
      balances: [5000, 3700],
    })

    await plugin.register(mockContext)
    await plugin.executeAction("forceTick", { userId: "admin" })

    expect(mockContext.game.setEconomyScale).not.toHaveBeenCalled()
    expect(mockContext.api.emit).toHaveBeenCalledWith(
      "TICK",
      expect.objectContaining({
        acted: false,
        reason: "min_participants",
        participantCount: 2,
      }),
      { invalidatesUserState: false },
    )
    expect(mockContext.api.setPluginConfig).toHaveBeenCalledWith(
      "room1",
      "the-fed",
      expect.objectContaining({
        tickReason: "min_participants",
        participantCount: 2,
      }),
    )
  })
})
