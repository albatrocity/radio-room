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
    compareAndSet: vi.fn(async () => true),
    getJson: vi.fn(async (k: string) => {
      const raw = strings.get(k) ?? null
      if (!raw) return { raw: null, value: null }
      try {
        return { raw, value: JSON.parse(raw) }
      } catch {
        return { raw, value: null }
      }
    }),
    setJson: vi.fn(async (k: string, v: unknown) => {
      strings.set(k, JSON.stringify(v))
    }),
    updateJson: vi.fn(),
    lrange: vi.fn(async () => []),
    appendCapped: vi.fn(),
    cleanup: vi.fn(async () => {}),
    _strings: strings,
  }
}

function setup(configOverrides: Partial<RoundRobinDjConfig> = {}) {
  const storage = createInMemoryStorage()
  const config: RoundRobinDjConfig = { ...defaultRoundRobinDjConfig, ...configOverrides }

  const holders = new Set<string>()
  const assignments = new Map<
    string,
    { personaId: string; assignedBy: string; assignedAt: string }
  >()

  const api = {
    isRoomAdmin: vi.fn(async (_roomId: string, userId: string) => userId === "admin-1"),
    sendSystemMessage: vi.fn(async () => {}),
    sendUserSystemMessage: vi.fn(async () => {}),
    getUsers: vi.fn(
      async () =>
        [
          { userId: "a", username: "A", isDeputyDj: true },
          { userId: "b", username: "B", isDeputyDj: true },
          { userId: "c", username: "C", isDeputyDj: false },
        ] as User[],
    ),
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
    polls: api,
    schedule: api,
    queue: api,
    playback: api,
    catalog: api,
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

function queueItem(userId: string, trackId: string, addedAt = Date.now()): QueueItem {
  return {
    addedAt,
    addedBy: { userId, username: userId.toUpperCase() },
    mediaSource: { type: "spotify", trackId },
    track: { id: trackId, title: trackId, artists: [], album: { title: "" } },
  } as unknown as QueueItem
}

async function saveHold(
  storage: ReturnType<typeof createInMemoryStorage>,
  userId: string,
  trackId: string,
  mediaSourceType = "spotify",
) {
  await storage.set(
    `hold:${userId}`,
    JSON.stringify({
      trackId,
      mediaSourceType,
      username: userId.toUpperCase(),
      heldAt: Date.now(),
    }),
  )
}

/** Locked sequential round, current turn is `ids[0]`. */
function lockedSequential(ids: string[]) {
  const state = createInitialState("sequential", ids)
  state.order = [...ids]
  state.orderLocked = true
  state.phase = "locked"
  state.round = 2
  return state
}

function enqueuedTrackIds(api: { addToTrackQueue: { mock: { calls: unknown[][] } } }): string[] {
  return api.addToTrackQueue.mock.calls.map((call) => call[1] as string)
}

/** Drive the owner loop: propose a follow-up, apply its result, repeat. */
async function applyFollowUps(
  plugin: RoundRobinDjPlugin,
  api: { getQueue: { mockResolvedValue: (queue: QueueItem[]) => void } },
  queue: QueueItem[],
) {
  api.getQueue.mockResolvedValue(queue)
  const applied = []
  for (let round = 0; round < 50 && applied.length < 50; round++) {
    const followUps = await plugin.collectQueueFollowUps(ROOM)
    if (followUps.length === 0) break
    for (const followUp of followUps) {
      applied.push(followUp)
      await plugin.onQueueFollowUpResult({ followUp, success: true })
    }
  }
  return applied
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
      undefined,
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
    const { plugin, context, storage, api } = setup({
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

    const item = queueItem("a", "t-a")
    const applied = await applyFollowUps(plugin, api, [item])

    expect(applied).toEqual([
      expect.objectContaining({
        type: "enqueue",
        trackId: "held-b",
        mediaSourceType: "spotify",
        runPluginValidation: false,
        addedBy: { type: "user", userId: "b", username: "B" },
      }),
    ])
    expect(api.addToTrackQueue).not.toHaveBeenCalled()
    expect(await storage.get("hold:b")).toBeNull()
    const state = JSON.parse((await storage.get(STATE_KEY))!)
    // Both deputies queued → auto-advance starts the next round
    expect(state.round).toBe(3)
    expect(state.queuedThisRound).toEqual([])
    expect(state.order[state.currentIndex]).toBe("a")
  })

  it("keeps the hold and turn when flush enqueue fails", async () => {
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
    await storage.set(
      "hold:b",
      JSON.stringify({
        trackId: "held-b",
        mediaSourceType: "youtube",
        username: "B",
        heldAt: Date.now(),
      }),
    )

    api.getQueue.mockResolvedValue([queueItem("a", "t-a")])
    const [followUp] = await plugin.collectQueueFollowUps(ROOM)
    expect(followUp?.trackId).toBe("held-b")
    await plugin.onQueueFollowUpResult({
      followUp: followUp!,
      success: false,
      message: "Track not found",
    })
    expect(api.addToTrackQueue).not.toHaveBeenCalled()

    expect(await storage.get("hold:b")).toContain("held-b")
    const state = JSON.parse((await storage.get(STATE_KEY))!)
    expect(state.queuedThisRound).toEqual(["a"])
    expect(state.order[state.currentIndex]).toBe("b")
    expect(api.sendUserSystemMessage).toHaveBeenCalledWith(
      ROOM,
      "b",
      "Round Robin: could not add your held song (Track not found). Try adding again on your turn.",
      { type: "alert", status: "error" },
    )
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
      undefined,
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

  describe("hold flush outcomes", () => {
    it("flushes each later deputy's hold when the current deputy queues", async () => {
      const { plugin, context, storage, api } = setup({
        enabled: true,
        mode: "sequential",
        deferOutOfTurnQueues: true,
        autoAdvanceRounds: true,
      })
      await plugin.register(context)
      api.sendSystemMessage.mockClear()
      await writeState(plugin, storage, lockedSequential(["a", "b", "c", "d"]))
      await saveHold(storage, "b", "held-b")
      await saveHold(storage, "c", "held-c", "youtube")
      await saveHold(storage, "d", "held-d")

      const applied = await applyFollowUps(plugin, api, [queueItem("a", "t-a")])

      expect(applied.map((followUp) => followUp.trackId)).toEqual(["held-b", "held-c", "held-d"])
      expect(
        applied.map((followUp) => [
          followUp.trackId,
          followUp.addedBy,
          followUp.mediaSourceType,
          followUp.runPluginValidation,
        ]),
      ).toEqual([
        ["held-b", { type: "user", userId: "b", username: "B" }, "spotify", false],
        ["held-c", { type: "user", userId: "c", username: "C" }, "youtube", false],
        ["held-d", { type: "user", userId: "d", username: "D" }, "spotify", false],
      ])
      expect(api.addToTrackQueue).not.toHaveBeenCalled()
      expect(await storage.get("hold:b")).toBeNull()
      expect(await storage.get("hold:c")).toBeNull()
      expect(await storage.get("hold:d")).toBeNull()
      const state = JSON.parse((await storage.get(STATE_KEY))!)
      expect(state.round).toBe(3)
      expect(state.queuedThisRound).toEqual([])
      expect(state.order[state.currentIndex]).toBe("a")
      expect(api.sendSystemMessage.mock.calls.map((call) => call[1])).toEqual([
        "Round Robin: it's B's turn to queue",
        "Round Robin: it's C's turn to queue",
        "Round Robin: it's D's turn to queue",
        "Round Robin: it's A's turn to queue",
        "Round Robin: round 3 started",
      ])
    })

    it("does not enqueue a hold twice when the flush re-enters QUEUE_CHANGED", async () => {
      const { plugin, context, storage, api, lifecycleHandlers } = setup({
        enabled: true,
        mode: "sequential",
        deferOutOfTurnQueues: true,
        autoAdvanceRounds: false,
      })
      await plugin.register(context)
      const complete = lockedSequential(["a", "b", "c"])
      complete.queuedThisRound = ["a", "b", "c"]
      complete.phase = "roundComplete"
      await writeState(plugin, storage, complete)
      await saveHold(storage, "a", "held-a")

      api.addToTrackQueue.mockImplementation(async (_room: string, trackId: string) => {
        await emit(lifecycleHandlers, "QUEUE_CHANGED", {
          roomId: ROOM,
          queue: [queueItem("a", trackId)],
        })
        return { success: true as const, queuedItem: { track: { id: trackId } } as QueueItem }
      })

      await plugin.executeAction("advanceRound", { userId: "admin-1", username: "Admin" })

      expect(enqueuedTrackIds(api)).toEqual(["held-a"])
      const state = JSON.parse((await storage.get(STATE_KEY))!)
      expect(state.queuedThisRound).toEqual(["a"])
      expect(state.order[state.currentIndex]).toBe("b")
      expect(await storage.get("hold:a")).toBeNull()
    })

    it("drops the queuer's own hold and still flushes the next deputy", async () => {
      const { plugin, context, storage, api } = setup({
        enabled: true,
        mode: "sequential",
        deferOutOfTurnQueues: true,
        autoAdvanceRounds: false,
      })
      await plugin.register(context)
      await writeState(plugin, storage, lockedSequential(["a", "b"]))
      await saveHold(storage, "a", "held-a")
      await saveHold(storage, "b", "held-b")

      const applied = await applyFollowUps(plugin, api, [queueItem("a", "live-a")])

      expect(applied.map((followUp) => followUp.trackId)).toEqual(["held-b"])
      expect(api.addToTrackQueue).not.toHaveBeenCalled()
      expect(await storage.get("hold:a")).toBeNull()
      expect(await storage.get("hold:b")).toBeNull()
      const state = JSON.parse((await storage.get(STATE_KEY))!)
      expect(state.queuedThisRound).toEqual(["a", "b"])
    })

    it("ignores a queue snapshot that should not move the turn", async () => {
      const cases: { name: string; item: QueueItem; enabled?: boolean }[] = [
        { name: "stale", item: queueItem("a", "t-a", Date.now() - 5000) },
        { name: "plugin", item: queueItem("plugin:music-shop", "t-shop") },
        { name: "wrong turn", item: queueItem("c", "t-c") },
        { name: "disabled", item: queueItem("a", "t-a"), enabled: false },
      ]

      for (const current of cases) {
        const { plugin, context, storage, api, lifecycleHandlers } = setup({
          enabled: current.enabled ?? true,
          mode: "sequential",
          deferOutOfTurnQueues: true,
        })
        await plugin.register(context)
        await writeState(plugin, storage, lockedSequential(["a", "b", "c"]))
        await saveHold(storage, "b", "held-b")

        await emit(lifecycleHandlers, "QUEUE_CHANGED", {
          roomId: ROOM,
          queue: [current.item],
        })
        api.getQueue.mockResolvedValue([current.item])
        expect(await plugin.collectQueueFollowUps(ROOM), current.name).toEqual([])

        expect(enqueuedTrackIds(api), current.name).toEqual([])
        expect(await storage.get("hold:b"), current.name).toContain("held-b")
        const state = JSON.parse((await storage.get(STATE_KEY))!)
        expect(state.queuedThisRound, current.name).toEqual([])
        expect(state.order[state.currentIndex], current.name).toBe("a")
      }
    })

    it("flushes the next deputy's hold when the current deputy leaves", async () => {
      const { plugin, context, storage, api, lifecycleHandlers } = setup({
        enabled: true,
        mode: "sequential",
        deferOutOfTurnQueues: true,
      })
      await plugin.register(context)
      await writeState(plugin, storage, lockedSequential(["a", "b", "c"]))
      await saveHold(storage, "a", "held-a")
      await saveHold(storage, "b", "held-b")

      await emit(lifecycleHandlers, "USER_LEFT", {
        roomId: ROOM,
        user: { userId: "a", username: "A" },
      })

      expect(enqueuedTrackIds(api)).toEqual(["held-b"])
      expect(await storage.get("hold:a")).toBeNull()
      expect(await storage.get("hold:b")).toBeNull()
      const state = JSON.parse((await storage.get(STATE_KEY))!)
      expect(state.participants).toEqual(["b", "c"])
      expect(state.queuedThisRound).toEqual(["b"])
      expect(state.order[state.currentIndex]).toBe("c")
    })

    it("flushes a held track when an admin opens the next round on that deputy", async () => {
      const { plugin, context, storage, api } = setup({
        enabled: true,
        mode: "sequential",
        deferOutOfTurnQueues: true,
        autoAdvanceRounds: false,
      })
      await plugin.register(context)
      const complete = lockedSequential(["a", "b"])
      complete.queuedThisRound = ["a", "b"]
      complete.phase = "roundComplete"
      await writeState(plugin, storage, complete)
      await saveHold(storage, "a", "held-a", "youtube")

      const ok = await plugin.executeAction("advanceRound", {
        userId: "admin-1",
        username: "Admin",
      })

      expect(ok.success).toBe(true)
      expect(enqueuedTrackIds(api)).toEqual(["held-a"])
      expect(api.addToTrackQueue).toHaveBeenCalledWith(
        ROOM,
        "held-a",
        expect.objectContaining({
          addedBy: { type: "user", userId: "a", username: "A" },
          runPluginValidation: false,
          mediaSourceType: "youtube",
        }),
      )
      expect(await storage.get("hold:a")).toBeNull()
      const state = JSON.parse((await storage.get(STATE_KEY))!)
      expect(state.round).toBe(3)
      expect(state.queuedThisRound).toEqual(["a"])
      expect(state.order[state.currentIndex]).toBe("b")
    })

    it("flushes the new turn's hold after the current deputy is removed", async () => {
      const { plugin, context, storage, api, lifecycleHandlers } = setup({
        enabled: true,
        mode: "sequential",
        deferOutOfTurnQueues: true,
      })
      await plugin.register(context)
      await writeState(plugin, storage, lockedSequential(["a", "b", "c"]))
      await saveHold(storage, "b", "held-b")

      await emit(lifecycleHandlers, "DEPUTY_DJ_CHANGED", {
        roomId: ROOM,
        userId: "a",
        isDeputyDj: false,
      })
      expect(enqueuedTrackIds(api)).toEqual([])

      await vi.advanceTimersByTimeAsync(0)

      expect(enqueuedTrackIds(api)).toEqual(["held-b"])
      expect(await storage.get("hold:b")).toBeNull()
      const state = JSON.parse((await storage.get(STATE_KEY))!)
      expect(state.participants).not.toContain("a")
      expect(state.queuedThisRound).toEqual(["b"])
      expect(state.order[state.currentIndex]).toBe("c")
    })

    it("flushes the backward next deputy in forward-and-back mode", async () => {
      const { plugin, context, storage, api } = setup({
        enabled: true,
        mode: "forwardAndBack",
        deferOutOfTurnQueues: true,
        autoAdvanceRounds: true,
      })
      await plugin.register(context)
      const snake = createInitialState("forwardAndBack", ["a", "b", "c"])
      snake.order = ["a", "b", "c"]
      snake.orderLocked = true
      snake.phase = "locked"
      snake.round = 2
      snake.direction = -1
      snake.currentIndex = 2
      await writeState(plugin, storage, snake)
      await saveHold(storage, "b", "held-b")
      await saveHold(storage, "a", "held-a")

      const applied = await applyFollowUps(plugin, api, [queueItem("c", "t-c")])

      expect(applied.map((followUp) => followUp.trackId)).toEqual(["held-b", "held-a"])
      expect(api.addToTrackQueue).not.toHaveBeenCalled()
      const state = JSON.parse((await storage.get(STATE_KEY))!)
      expect(state.queuedThisRound).toEqual([])
      expect(state.direction).toBe(1)
      expect(state.order[state.currentIndex]).toBe("a")
    })
  })
})
