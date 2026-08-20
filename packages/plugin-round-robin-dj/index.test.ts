import { describe, expect, it, vi, beforeEach } from "vitest"
import type { PluginContext, QueueItem, User } from "@repo/types"
import { RoundRobinDjPlugin } from "./index"
import { defaultRoundRobinDjConfig, STATE_KEY, type RoundRobinDjConfig } from "./types"
import { createInitialState } from "./state"

const ROOM = "room-1"

function createInMemoryStorage() {
  const strings = new Map<string, string>()
  return {
    get: vi.fn(async (k: string) => strings.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => {
      strings.set(k, v)
    }),
    del: vi.fn(async (k: string) => {
      strings.delete(k)
    }),
    exists: vi.fn(async (k: string) => strings.has(k)),
    inc: vi.fn(),
    dec: vi.fn(),
    mget: vi.fn(),
    pipeline: vi.fn(),
    zadd: vi.fn(),
    zrem: vi.fn(),
    zrank: vi.fn(),
    zrevrank: vi.fn(),
    zrange: vi.fn(async () => []),
    zrangeWithScores: vi.fn(async () => []),
    zrangebyscore: vi.fn(async () => []),
    zremrangebyscore: vi.fn(),
    zscore: vi.fn(),
    zincrby: vi.fn(),
    hget: vi.fn(),
    hset: vi.fn(),
    hgetall: vi.fn(),
    hsetnx: vi.fn(),
    cleanup: vi.fn(async () => {}),
    _strings: strings,
  }
}

function setup(configOverrides: Partial<RoundRobinDjConfig> = {}) {
  const storage = createInMemoryStorage()
  const config: RoundRobinDjConfig = { ...defaultRoundRobinDjConfig, ...configOverrides }

  const holders = new Set<string>()
  const assignments = new Map<string, { personaId: string; assignedBy: string; assignedAt: string }>()

  const api = {
    isRoomAdmin: vi.fn(async (_roomId: string, userId: string) => userId === "admin-1"),
    sendSystemMessage: vi.fn(async () => {}),
    sendUserSystemMessage: vi.fn(async () => {}),
    getUsers: vi.fn(async () => [
      { userId: "a", username: "A", isDeputyDj: true },
      { userId: "b", username: "B", isDeputyDj: true },
      { userId: "c", username: "C", isDeputyDj: false },
    ] as User[]),
    getUsersByIds: vi.fn(async (ids: string[]) =>
      ids.map((id) => ({ userId: id, username: id.toUpperCase() })),
    ),
    getPluginConfig: vi.fn(async () => config),
    setPluginConfig: vi.fn(async () => {}),
    getQueue: vi.fn(async () => []),
    getNowPlaying: vi.fn(async () => null),
    getReactions: vi.fn(async () => []),
    skipTrack: vi.fn(async () => {}),
    updatePlaylistTrack: vi.fn(async () => {}),
    emit: vi.fn(async () => {}),
    queueSoundEffect: vi.fn(async () => {}),
    queueScreenEffect: vi.fn(async () => {}),
    addToTrackQueue: vi.fn(async () => ({
      success: true as const,
      queuedItem: { track: { id: "held" } } as QueueItem,
    })),
  }

  const personas = {
    registerPersonas: vi.fn(async () => {}),
    unregisterPersonas: vi.fn(async () => {}),
    assign: vi.fn(async (userId: string, personaId: string, assignedBy?: string) => {
      holders.add(userId)
      assignments.set(userId, {
        personaId: `plugin:round-robin-dj:${personaId}`,
        assignedBy: assignedBy ?? "round-robin-dj",
        assignedAt: new Date().toISOString(),
      })
    }),
    remove: vi.fn(async (userId: string) => {
      holders.delete(userId)
      assignments.delete(userId)
    }),
    getRoomPersonas: vi.fn(async () => []),
    getUserPersonas: vi.fn(async (userId: string) => {
      const a = assignments.get(userId)
      return a ? [a] : []
    }),
    getUsersWithPersona: vi.fn(async () => [...holders]),
    getUserPersonasHydrated: vi.fn(async () => []),
  }

  const lifecycleHandlers = new Map<string, Function[]>()
  const lifecycle = {
    on: vi.fn((event: string, handler: Function) => {
      const list = lifecycleHandlers.get(event) ?? []
      list.push(handler)
      lifecycleHandlers.set(event, list)
    }),
    off: vi.fn(),
  }

  const context = {
    roomId: ROOM,
    api,
    storage,
    lifecycle,
    personas,
    game: {},
    inventory: {},
    artifacts: {},
    getRoom: vi.fn(async () => null),
    appContext: {},
  } as unknown as PluginContext

  const plugin = new RoundRobinDjPlugin()

  return { plugin, context, config, storage, api, personas, lifecycleHandlers }
}

async function emit(
  handlers: Map<string, Function[]>,
  event: string,
  data: unknown,
): Promise<void> {
  for (const h of handlers.get(event) ?? []) {
    await h(data)
  }
}

/** Tests that poke Redis/storage directly must clear the plugin's state cache (P5). */
async function writeState(
  plugin: RoundRobinDjPlugin,
  storage: ReturnType<typeof createInMemoryStorage>,
  state: unknown,
): Promise<void> {
  await storage.set(STATE_KEY, JSON.stringify(state))
  ;(plugin as unknown as { stateCache: undefined }).stateCache = undefined
}

describe("RoundRobinDjPlugin", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-03T12:00:00Z"))
  })

  it("registers lifecycle handlers and exposes config schema with quickAccess", async () => {
    const { plugin, context, lifecycleHandlers } = setup()
    await plugin.register(context)

    expect(lifecycleHandlers.has("QUEUE_CHANGED")).toBe(true)
    expect(lifecycleHandlers.has("DEPUTY_DJ_CHANGED")).toBe(true)
    expect(lifecycleHandlers.has("DEPUTY_BULK_APPLIED")).toBe(true)
    expect(lifecycleHandlers.has("USER_LEFT")).toBe(true)
    expect(lifecycleHandlers.has("USER_JOINED")).toBe(true)
    expect(lifecycleHandlers.has("PERSONA_ASSIGNED")).toBe(true)

    const schema = plugin.getConfigSchema()
    expect(schema.quickAccess).toEqual(["advanceRound"])
    expect(schema.layout.some((i) => typeof i === "object" && i.type === "action")).toBe(true)

    const components = plugin.getComponentSchema()
    expect(components.components.every((c) => c.area === "addToQueue")).toBe(true)
    expect(components.storeKeys).toContain("eligibleUserIds")
  })

  it("seeds state from deputies on enable", async () => {
    const { plugin, context, storage, personas, api } = setup({ enabled: true })
    await plugin.register(context)

    const raw = await storage.get(STATE_KEY)
    expect(raw).toBeTruthy()
    const state = JSON.parse(raw!)
    expect(state.participants.sort()).toEqual(["a", "b"])
    expect(personas.registerPersonas).toHaveBeenCalled()
    expect(api.sendSystemMessage).toHaveBeenCalledWith(
      ROOM,
      expect.stringContaining("Round Robin DJ enabled"),
      expect.any(Object),
    )
    expect(api.emit).toHaveBeenCalledWith(
      "QUEUE_STATUS",
      expect.objectContaining({
        eligibleUserIds: expect.arrayContaining(["a", "b"]),
        participantUserIds: expect.arrayContaining(["a", "b"]),
      }),
    )

    const componentState = await plugin.getComponentState()
    expect(componentState.eligibleUserIds).toEqual(expect.arrayContaining(["a", "b"]))
  })

  it("rejects out-of-turn queue requests and allows admins", async () => {
    const { plugin, context, storage } = setup({ enabled: true, mode: "sequential" })
    await plugin.register(context)

    // Lock order a, b via storage
    const locked = createInitialState("sequential", ["a", "b"])
    locked.order = ["a", "b"]
    locked.orderLocked = true
    locked.phase = "locked"
    locked.round = 2
    await writeState(plugin, storage, locked)

    const deny = await plugin.validateQueueRequest({
      roomId: ROOM,
      userId: "b",
      username: "B",
      trackId: "t1",
    })
    expect("allowed" in deny && deny.allowed).toBe(false)

    const allow = await plugin.validateQueueRequest({
      roomId: ROOM,
      userId: "a",
      username: "A",
      trackId: "t1",
    })
    expect("allowed" in allow && allow.allowed).toBe(true)

    const admin = await plugin.validateQueueRequest({
      roomId: ROOM,
      userId: "admin-1",
      username: "Admin",
      trackId: "t1",
    })
    expect("allowed" in admin && admin.allowed).toBe(true)
  })

  it("defers out-of-turn selection when deferOutOfTurnQueues is enabled", async () => {
    const { plugin, context, storage, api } = setup({
      enabled: true,
      mode: "sequential",
      deferOutOfTurnQueues: true,
    })
    await plugin.register(context)

    const locked = createInitialState("sequential", ["a", "b"])
    locked.order = ["a", "b"]
    locked.orderLocked = true
    locked.phase = "locked"
    locked.round = 2
    await writeState(plugin, storage, locked)

    const result = await plugin.validateQueueRequest({
      roomId: ROOM,
      userId: "b",
      username: "B",
      trackId: "track-b",
      mediaSourceType: "youtube",
    })
    expect(result).toEqual({
      deferred: true,
      message: "Song saved — it will be added when it's your turn",
    })
    expect(await storage.get("hold:b")).toContain("track-b")
    expect(api.sendUserSystemMessage).toHaveBeenCalled()

    expect(
      await plugin.grantMetadataSourceAccess({
        roomId: ROOM,
        userId: "b",
        sourceId: "youtube",
        action: "queue",
      }),
    ).toBe("grant")
  })

  it("holds a second discovery-round pick for the next round", async () => {
    const { plugin, context, storage } = setup({
      enabled: true,
      mode: "sequential",
      deferOutOfTurnQueues: true,
    })
    await plugin.register(context)

    const open = createInitialState("sequential", ["a", "b"])
    open.order = ["a"]
    open.queuedThisRound = ["a"]
    await writeState(plugin, storage, open)

    const result = await plugin.validateQueueRequest({
      roomId: ROOM,
      userId: "a",
      username: "A",
      trackId: "track-a2",
      mediaSourceType: "spotify",
    })
    expect(result).toEqual({
      deferred: true,
      message: "Song saved — it will be added on your turn next round",
    })
    expect(await storage.get("hold:a")).toContain("track-a2")
  })

  it("flushes a held track when the previous deputy queues", async () => {
    const { plugin, context, storage, api, lifecycleHandlers } = setup({
      enabled: true,
      mode: "sequential",
      deferOutOfTurnQueues: true,
      autoAdvanceRounds: true,
    })
    await plugin.register(context)

    const locked = createInitialState("sequential", ["a", "b"])
    locked.order = ["a", "b"]
    locked.orderLocked = true
    locked.phase = "locked"
    locked.round = 2
    await writeState(plugin, storage, locked)
    await storage.set(
      "hold:b",
      JSON.stringify({
        trackId: "held-b",
        mediaSourceType: "spotify",
        username: "B",
        heldAt: Date.now(),
      }),
    )

    const item = {
      addedAt: Date.now(),
      addedBy: { userId: "a", username: "A" },
      mediaSource: { type: "spotify", trackId: "t-a" },
      track: { id: "t-a", title: "A", artists: [], album: { title: "" } },
    } as unknown as QueueItem

    await emit(lifecycleHandlers, "QUEUE_CHANGED", { roomId: ROOM, queue: [item] })

    expect(api.addToTrackQueue).toHaveBeenCalledWith(
      ROOM,
      "held-b",
      expect.objectContaining({
        addedBy: { type: "user", userId: "b", username: "B" },
        runPluginValidation: false,
        mediaSourceType: "spotify",
        suppressQueueChanged: true,
      }),
    )
    expect(await storage.get("hold:b")).toBeNull()
    const state = JSON.parse((await storage.get(STATE_KEY))!)
    // Both deputies queued → auto-advance starts the next round
    expect(state.round).toBe(3)
    expect(state.queuedThisRound).toEqual([])
    expect(state.order[state.currentIndex]).toBe("a")
  })

  it("keeps the hold and turn when flush enqueue fails", async () => {
    const { plugin, context, storage, api, lifecycleHandlers } = setup({
      enabled: true,
      mode: "sequential",
      deferOutOfTurnQueues: true,
    })
    await plugin.register(context)

    const locked = createInitialState("sequential", ["a", "b"])
    locked.order = ["a", "b"]
    locked.orderLocked = true
    locked.phase = "locked"
    locked.round = 2
    await writeState(plugin, storage, locked)
    await storage.set(
      "hold:b",
      JSON.stringify({
        trackId: "held-b",
        mediaSourceType: "youtube",
        username: "B",
        heldAt: Date.now(),
      }),
    )

    api.addToTrackQueue.mockResolvedValueOnce({
      success: false,
      message: "Track not found",
    })

    const item = {
      addedAt: Date.now(),
      addedBy: { userId: "a", username: "A" },
      mediaSource: { type: "spotify", trackId: "t-a" },
      track: { id: "t-a", title: "A", artists: [], album: { title: "" } },
    } as unknown as QueueItem

    await emit(lifecycleHandlers, "QUEUE_CHANGED", { roomId: ROOM, queue: [item] })

    expect(await storage.get("hold:b")).toContain("held-b")
    const state = JSON.parse((await storage.get(STATE_KEY))!)
    expect(state.queuedThisRound).toEqual(["a"])
    expect(state.order[state.currentIndex]).toBe("b")
  })

  it("grants metadata access only to eligible deputies", async () => {
    const { plugin, context, storage } = setup({ enabled: true, mode: "nonSequential" })
    await plugin.register(context)

    const state = createInitialState("nonSequential", ["a", "b"])
    state.queuedThisRound = ["a"]
    await writeState(plugin, storage, state)

    expect(
      await plugin.grantMetadataSourceAccess({
        roomId: ROOM,
        userId: "b",
        sourceId: "youtube",
        action: "queue",
      }),
    ).toBe("grant")

    expect(
      await plugin.grantMetadataSourceAccess({
        roomId: ROOM,
        userId: "a",
        sourceId: "youtube",
        action: "search",
      }),
    ).toBe("abstain")
  })

  it("advances state on QUEUE_CHANGED for eligible deputy", async () => {
    const { plugin, context, storage, lifecycleHandlers } = setup({
      enabled: true,
      mode: "sequential",
    })
    await plugin.register(context)

    const item = {
      addedAt: Date.now(),
      addedBy: { userId: "a", username: "A" },
      mediaSource: { type: "spotify", trackId: "t1" },
      track: { id: "t1", title: "T", artists: [], album: { title: "" } },
    } as unknown as QueueItem

    await emit(lifecycleHandlers, "QUEUE_CHANGED", { roomId: ROOM, queue: [item] })

    const state = JSON.parse((await storage.get(STATE_KEY))!)
    expect(state.queuedThisRound).toEqual(["a"])
    expect(state.order).toEqual(["a"])
  })

  it("adds and removes deputies via DEPUTY_DJ_CHANGED", async () => {
    const { plugin, context, storage, lifecycleHandlers, personas } = setup({ enabled: true })
    await plugin.register(context)
    personas.assign.mockClear()
    personas.remove.mockClear()
    personas.getUsersWithPersona.mockClear()

    await emit(lifecycleHandlers, "DEPUTY_DJ_CHANGED", {
      roomId: ROOM,
      userId: "c",
      isDeputyDj: true,
    })
    let state = JSON.parse((await storage.get(STATE_KEY))!)
    expect(state.participants).toContain("c")

    // Coalesced roster sync runs on the next macrotask
    await vi.advanceTimersByTimeAsync(0)
    expect(personas.assign).toHaveBeenCalledWith("c", "robin")

    await emit(lifecycleHandlers, "DEPUTY_DJ_CHANGED", {
      roomId: ROOM,
      userId: "c",
      isDeputyDj: false,
    })
    state = JSON.parse((await storage.get(STATE_KEY))!)
    expect(state.participants).not.toContain("c")
    await vi.advanceTimersByTimeAsync(0)
    expect(personas.remove).toHaveBeenCalledWith("c", "robin")
  })

  it("reconciles roster once on DEPUTY_BULK_APPLIED after per-user events", async () => {
    const { plugin, context, storage, lifecycleHandlers, personas, api } = setup({
      enabled: true,
    })
    await plugin.register(context)
    personas.assign.mockClear()
    personas.getUsersWithPersona.mockClear()
    api.emit.mockClear()

    api.getUsers.mockResolvedValue([
      { userId: "a", username: "A", isDeputyDj: true },
      { userId: "b", username: "B", isDeputyDj: true },
      { userId: "c", username: "C", isDeputyDj: true },
    ] as User[])

    await emit(lifecycleHandlers, "DEPUTY_DJ_CHANGED", {
      roomId: ROOM,
      userId: "c",
      isDeputyDj: true,
    })
    await emit(lifecycleHandlers, "DEPUTY_DJ_CHANGED", {
      roomId: ROOM,
      userId: "d",
      isDeputyDj: true,
    })

    const assignsBeforeBulk = personas.assign.mock.calls.length

    await emit(lifecycleHandlers, "DEPUTY_BULK_APPLIED", {
      roomId: ROOM,
      action: "deputize_all",
    })

    // Bulk cancels the coalesced timer — no N-fold sync from DEPUTY_DJ_CHANGED
    await vi.advanceTimersByTimeAsync(0)
    expect(personas.assign.mock.calls.length).toBe(assignsBeforeBulk + 1)

    const state = JSON.parse((await storage.get(STATE_KEY))!)
    expect(state.participants.sort()).toEqual(["a", "b", "c"])
    expect(api.emit).toHaveBeenCalledWith(
      "QUEUE_STATUS",
      expect.objectContaining({
        participantUserIds: expect.arrayContaining(["a", "b", "c"]),
      }),
    )
  })

  it("skips Robin assign/remove when eligibility is unchanged", async () => {
    const { plugin, context, personas } = setup({ enabled: true, mode: "nonSequential" })
    await plugin.register(context)
    personas.assign.mockClear()
    personas.remove.mockClear()
    personas.getUsersWithPersona.mockClear()

    const robin = (plugin as unknown as { robin: { sync: (s: unknown) => Promise<void> } }).robin
    const state = createInitialState("nonSequential", ["a", "b"])
    await robin.sync(state)
    await robin.sync(state)
    expect(personas.getUsersWithPersona).not.toHaveBeenCalled()
    expect(personas.assign).not.toHaveBeenCalled()
    expect(personas.remove).not.toHaveBeenCalled()
  })

  it("reuses cached state across grantMetadataSourceAccess calls", async () => {
    const { plugin, context, storage } = setup({ enabled: true, mode: "nonSequential" })
    await plugin.register(context)
    storage.get.mockClear()

    await plugin.grantMetadataSourceAccess({
      roomId: ROOM,
      userId: "b",
      sourceId: "youtube",
      action: "search",
    })
    await plugin.grantMetadataSourceAccess({
      roomId: ROOM,
      userId: "a",
      sourceId: "youtube",
      action: "search",
    })

    const stateReads = storage.get.mock.calls.filter(([key]) => key === STATE_KEY)
    expect(stateReads.length).toBeLessThanOrEqual(1)
  })

  it("removes participants on USER_LEFT", async () => {
    const { plugin, context, storage, lifecycleHandlers } = setup({ enabled: true })
    await plugin.register(context)

    await emit(lifecycleHandlers, "USER_LEFT", {
      roomId: ROOM,
      user: { userId: "a", username: "A" },
    })
    const state = JSON.parse((await storage.get(STATE_KEY))!)
    expect(state.participants).toEqual(["b"])
  })

  it("adds join-while-deputy via the same coalesced roster path as DEPUTY_DJ_CHANGED", async () => {
    const { plugin, context, storage, lifecycleHandlers, personas } = setup({ enabled: true })
    await plugin.register(context)
    personas.assign.mockClear()

    await emit(lifecycleHandlers, "USER_JOINED", {
      roomId: ROOM,
      user: { userId: "c", username: "C", isDeputyDj: true },
    })
    expect(JSON.parse((await storage.get(STATE_KEY))!).participants).toContain("c")

    await vi.advanceTimersByTimeAsync(0)
    expect(personas.assign).toHaveBeenCalledWith("c", "robin")
  })

  it("applies admin Robin designation from PERSONA_ASSIGNED", async () => {
    const { plugin, context, storage, lifecycleHandlers, personas } = setup({
      enabled: true,
      mode: "nonSequential",
    })
    await plugin.register(context)

    personas.getUserPersonas.mockResolvedValueOnce([
      {
        personaId: "plugin:round-robin-dj:robin",
        assignedBy: "admin-1",
        assignedAt: new Date().toISOString(),
      },
    ])

    await emit(lifecycleHandlers, "PERSONA_ASSIGNED", {
      roomId: ROOM,
      userId: "b",
      personaId: "plugin:round-robin-dj:robin",
    })

    const state = JSON.parse((await storage.get(STATE_KEY))!)
    expect(state.adminForcedUserId).toBe("b")
  })

  it("advanceRound action requires admin and advances state", async () => {
    const { plugin, context, storage } = setup({
      enabled: true,
      mode: "sequential",
      autoAdvanceRounds: false,
    })
    await plugin.register(context)

    let state = createInitialState("sequential", ["a", "b"])
    state.queuedThisRound = ["a", "b"]
    state.order = ["a", "b"]
    state.orderLocked = true
    state.phase = "roundComplete"
    await writeState(plugin, storage, state)

    const denied = await plugin.executeAction("advanceRound", { userId: "a", username: "A" })
    expect(denied.success).toBe(false)

    const ok = await plugin.executeAction("advanceRound", {
      userId: "admin-1",
      username: "Admin",
    })
    expect(ok.success).toBe(true)
    state = JSON.parse((await storage.get(STATE_KEY))!)
    expect(state.round).toBe(2)
    expect(state.phase).toBe("locked")
    expect(state.queuedThisRound).toEqual([])
  })

  it("cancels a matching hold and ignores a mismatched trackId", async () => {
    const { plugin, context, storage } = setup({
      enabled: true,
      mode: "sequential",
      deferOutOfTurnQueues: true,
    })
    await plugin.register(context)
    await storage.set(
      "hold:b",
      JSON.stringify({
        trackId: "held-b",
        mediaSourceType: "spotify",
        username: "B",
        heldAt: Date.now(),
      }),
    )

    await expect(
      plugin.cancelHeldQueue({ roomId: ROOM, userId: "b", trackId: "other" }),
    ).resolves.toEqual({ cancelled: false })
    expect(await storage.get("hold:b")).toContain("held-b")

    await expect(
      plugin.cancelHeldQueue({ roomId: ROOM, userId: "b", trackId: "held-b" }),
    ).resolves.toEqual({ cancelled: true })
    expect(await storage.get("hold:b")).toBeNull()
  })

  it("restores a spent turn when the queued item is removed", async () => {
    const { plugin, context, storage } = setup({ enabled: true, mode: "sequential" })
    await plugin.register(context)

    let state = createInitialState("sequential", ["a", "b", "c"])
    state.order = ["a", "b", "c"]
    state.orderLocked = true
    state.phase = "locked"
    state.round = 2
    state.queuedThisRound = ["a"]
    state.currentIndex = 1
    await writeState(plugin, storage, state)

    const item = {
      addedAt: Date.now(),
      addedBy: { userId: "a", username: "A" },
      mediaSource: { type: "spotify", trackId: "t-a" },
      track: { id: "t-a", title: "A" },
    } as unknown as QueueItem

    await plugin.onQueueItemRemoved({ roomId: ROOM, item, remainingQueue: [] })
    state = JSON.parse((await storage.get(STATE_KEY))!)
    expect(state.queuedThisRound).toEqual([])
    expect(state.order).toEqual(["b", "c", "a"])
    expect(state.order[state.currentIndex]).toBe("b")
  })
})
