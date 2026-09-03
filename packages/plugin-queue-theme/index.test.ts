import { describe, it, expect, vi, beforeEach } from "vitest"
import type { PluginContext, QueueItem } from "@repo/types"
import { QueueThemePlugin } from "./index"
import { defaultQueueThemeConfig, type QueueThemeConfig, type QueueThemeRound } from "./types"

const ROOM = "test-room"
const ADMIN = { userId: "admin-1", username: "Admin" }

function createInMemoryStorage() {
  const strings = new Map<string, string>()
  const zsets = new Map<string, Map<string, number>>()
  const hashes = new Map<string, Map<string, string>>()
  return {
    strings,
    zsets,
    hashes,
    get: vi.fn(async (k: string) => strings.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => {
      strings.set(k, v)
    }),
    del: vi.fn(async (k: string) => {
      strings.delete(k)
      zsets.delete(k)
      hashes.delete(k)
    }),
    exists: vi.fn(async (k: string) => strings.has(k)),
    inc: vi.fn(),
    dec: vi.fn(),
    mget: vi.fn(),
    pipeline: vi.fn(),
    zadd: vi.fn(async (k: string, score: number, value: string) => {
      if (!zsets.has(k)) zsets.set(k, new Map())
      zsets.get(k)!.set(value, score)
    }),
    zrem: vi.fn(),
    zrank: vi.fn(),
    zrevrank: vi.fn(),
    zrange: vi.fn(async () => []),
    zrangeWithScores: vi.fn(async (k: string) => {
      const z = zsets.get(k)
      return z ? [...z.entries()].map(([value, score]) => ({ value, score })) : []
    }),
    zrangebyscore: vi.fn(async () => []),
    zremrangebyscore: vi.fn(),
    zscore: vi.fn(),
    zincrby: vi.fn(async (k: string, inc: number, v: string) => {
      if (!zsets.has(k)) zsets.set(k, new Map())
      const z = zsets.get(k)!
      const next = (z.get(v) ?? 0) + inc
      z.set(v, next)
      return next
    }),
    hget: vi.fn(async (k: string, f: string) => hashes.get(k)?.get(f) ?? null),
    hset: vi.fn(async (k: string, f: string, v: string) => {
      if (!hashes.has(k)) hashes.set(k, new Map())
      hashes.get(k)!.set(f, v)
    }),
    hgetall: vi.fn(async (k: string) => Object.fromEntries(hashes.get(k) ?? new Map())),
    hsetnx: vi.fn(),
    cleanup: vi.fn(async () => {}),
  }
}

function makeTrack(overrides?: Partial<QueueItem> & { djId?: string; trackId?: string }): QueueItem {
  const djId = overrides?.djId ?? "dj-1"
  const trackId = overrides?.trackId ?? "t1"
  return {
    title: overrides?.title ?? "Song Title",
    track: {
      id: trackId,
      title: overrides?.title ?? "Song Title",
      artists: [{ id: "a1", title: "Artist" }],
      urls: [],
      ...(overrides?.track as object),
    } as QueueItem["track"],
    mediaSource: overrides?.mediaSource ?? { type: "spotify", trackId },
    addedAt: Date.now(),
    addedBy: { userId: djId, username: "DJ One" } as QueueItem["addedBy"],
  } as QueueItem
}

function setup(configOverrides: Partial<QueueThemeConfig> = {}) {
  const storage = createInMemoryStorage()
  const config: QueueThemeConfig = {
    ...defaultQueueThemeConfig,
    enabled: true,
    ...configOverrides,
  }

  const polls = new Map<string, { question: string; options: { id: string; label: string }[] }>()
  let activePollId: string | null = null
  const votes: Record<string, Record<string, string>> = {}

  const api = {
    isRoomAdmin: vi.fn(async () => true),
    getPluginConfig: vi.fn(async () => config),
    setPluginConfig: vi.fn(async () => {}),
    emit: vi.fn(async () => {}),
    getUsers: vi.fn(async () => [
      { userId: "admin-1", username: "Admin" },
      { userId: "dj-1", username: "DJ One" },
      { userId: "u2", username: "User Two" },
      { userId: "u3", username: "User Three" },
    ]),
    getOnlineUserIds: vi.fn(async () => ["admin-1", "dj-1", "u2", "u3"]),
    getUsersByIds: vi.fn(async (ids: string[]) =>
      ids.map((userId) => ({ userId, username: userId })),
    ),
    getActivePoll: vi.fn(async () => (activePollId ? { id: activePollId } : null)),
    getNowPlaying: vi.fn(async () => null),
    getQueue: vi.fn(async () => []),
    setQueueSplit: vi.fn(async () => ({ success: true })),
    sendSystemMessage: vi.fn(async () => undefined),
    sendUserSystemMessage: vi.fn(async () => undefined),
    createPoll: vi.fn(async (params: { question: string; options: { label: string }[] }) => {
      if (activePollId) {
        return {
          ok: false as const,
          error: { status: 409, error: "Conflict", message: "active" },
        }
      }
      const id = `poll-${polls.size + 1}`
      const options = params.options.map((o, i) => ({
        id: `${id}-opt-${i}`,
        label: o.label,
      }))
      polls.set(id, { question: params.question, options })
      activePollId = id
      votes[id] = {}
      return {
        ok: true as const,
        poll: {
          id,
          roomId: ROOM,
          question: params.question,
          options,
          status: "open" as const,
          settings: { hideRunningTotal: true },
          createdAt: Date.now(),
          createdBy: ADMIN.userId,
          publishedAt: Date.now(),
          closedAt: null,
          closesAt: null,
        },
      }
    }),
    closePoll: vi.fn(async (params: { pollId: string }) => {
      const poll = polls.get(params.pollId)
      if (!poll) {
        return {
          ok: false as const,
          error: { status: 404, error: "Not Found", message: "missing" },
        }
      }
      const pollVotes = votes[params.pollId] ?? {}
      const optionTallies: Record<string, number> = {}
      for (const o of poll.options) optionTallies[o.id] = 0
      for (const opt of Object.values(pollVotes)) {
        if (opt in optionTallies) optionTallies[opt] += 1
      }
      activePollId = null
      return {
        ok: true as const,
        poll: {
          id: params.pollId,
          status: "closed" as const,
          question: poll.question,
          options: poll.options,
        },
        results: {
          pollId: params.pollId,
          totalVotes: Object.keys(pollVotes).length,
          optionTallies,
          winners: [] as string[],
          closedAt: Date.now(),
        },
      }
    }),
    getPollVoterIds: vi.fn(async (_room: string, pollId: string) =>
      Object.keys(votes[pollId] ?? {}),
    ),
    getPollVotes: vi.fn(async (_room: string, pollId: string) => votes[pollId] ?? {}),
  }

  const game = {
    getActiveSession: vi.fn(async () => ({ id: "sess-1" })),
    addScore: vi.fn(async () => 0),
    addScores: vi.fn(async () => [0, 0]),
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
    game,
    personas: {
      registerPersonas: vi.fn(),
      unregisterPersonas: vi.fn(),
    },
    lifecycle,
  } as unknown as PluginContext

  const plugin = new QueueThemePlugin()

  return {
    plugin,
    context,
    api,
    storage,
    config,
    game,
    lifecycleHandlers,
    polls,
    votes,
    getActivePollId: () => activePollId,
    setActivePollId: (id: string | null) => {
      activePollId = id
    },
  }
}

describe("QueueThemePlugin", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("startRound fails without a game session", async () => {
    const ctx = setup()
    await ctx.plugin.register(ctx.context)
    ctx.game.getActiveSession.mockResolvedValue(null)
    const result = await ctx.plugin.executeAction("startRound", ADMIN, { theme: "Driving" })
    expect(result.success).toBe(false)
    expect(result.message).toMatch(/game session/i)
  })

  it("startRound fails when a poll is already active", async () => {
    const ctx = setup()
    await ctx.plugin.register(ctx.context)
    ctx.setActivePollId("other")
    ctx.api.getActivePoll.mockResolvedValue({ id: "other" })
    const result = await ctx.plugin.executeAction("startRound", ADMIN, { theme: "Driving" })
    expect(result.success).toBe(false)
    expect(result.message).toMatch(/poll is already active/i)
  })

  it("startRound stores themes and opens a poll for now-playing", async () => {
    const ctx = setup()
    await ctx.plugin.register(ctx.context)
    ctx.api.getNowPlaying.mockResolvedValue(makeTrack())

    const result = await ctx.plugin.executeAction("startRound", ADMIN, { theme: "Driving songs" })
    expect(result.success).toBe(true)
    expect(ctx.api.createPoll).toHaveBeenCalledWith(
      expect.objectContaining({
        announce: false,
        question: expect.stringContaining("Song Title"),
        settings: { hideRunningTotal: true },
      }),
    )
    expect(ctx.api.sendUserSystemMessage).toHaveBeenCalled()
    expect(ctx.api.sendSystemMessage).toHaveBeenCalledWith(
      ROOM,
      expect.stringMatching(/open Add to Queue to see your theme/i),
      { type: "alert", status: "info" },
    )
    const assignment = await ctx.plugin.contributeToUserGameState("dj-1", { itemDefinitions: [] })
    expect(assignment).toMatchObject({ theme: "Driving songs", isDecoy: false })
  })

  it("TRACK_CHANGED closes prior poll and pays DJ max(0, yes-no)", async () => {
    const ctx = setup({ coinPerNetVote: 1 })
    await ctx.plugin.register(ctx.context)
    ctx.api.getNowPlaying.mockResolvedValue(makeTrack({ djId: "dj-1" }))
    await ctx.plugin.executeAction("startRound", ADMIN, { theme: "Theme" })

    const pollId = ctx.getActivePollId()!
    const poll = ctx.polls.get(pollId)!
    const yes = poll.options.find((o) => o.label === "Yes")!.id
    const no = poll.options.find((o) => o.label === "No")!.id
    ctx.votes[pollId] = { u2: yes, u3: yes, "admin-1": no }

    const handlers = ctx.lifecycleHandlers.get("TRACK_CHANGED") ?? []
    await handlers[0]!({
      roomId: ROOM,
      track: makeTrack({ djId: "u2", trackId: "t2", title: "Next" }),
    })

    expect(ctx.api.closePoll).toHaveBeenCalledWith(
      expect.objectContaining({ pollId, announce: false }),
    )
    expect(ctx.game.addScores).toHaveBeenCalledWith(
      "dj-1",
      [
        { attribute: "coin", amount: 1 },
        { attribute: "score", amount: 1 },
      ],
      "queue-theme",
    )
    expect(ctx.api.createPoll).toHaveBeenCalledTimes(2)
    expect(ctx.api.emit).toHaveBeenCalledWith(
      "STANDINGS_UPDATED",
      expect.any(Object),
      { invalidatesUserState: false },
    )
    expect(ctx.api.emit).toHaveBeenCalledWith(
      "POLL_CYCLE",
      expect.any(Object),
      { invalidatesUserState: false },
    )
  })

  it("does not open a poll when a foreign poll is active mid-round", async () => {
    const ctx = setup()
    await ctx.plugin.register(ctx.context)
    await ctx.plugin.executeAction("startRound", ADMIN, { theme: "Theme" })
    expect(ctx.api.createPoll).toHaveBeenCalledTimes(0)

    ctx.setActivePollId("foreign")
    ctx.api.getActivePoll.mockResolvedValue({ id: "foreign" })

    const handlers = ctx.lifecycleHandlers.get("TRACK_CHANGED") ?? []
    await handlers[0]!({ roomId: ROOM, track: makeTrack() })
    expect(ctx.api.createPoll).toHaveBeenCalledTimes(0)
  })

  it("all-voted quorum closes the poll", async () => {
    const ctx = setup()
    await ctx.plugin.register(ctx.context)
    ctx.api.getNowPlaying.mockResolvedValue(makeTrack({ djId: "dj-1" }))
    await ctx.plugin.executeAction("startRound", ADMIN, { theme: "Theme" })

    const pollId = ctx.getActivePollId()!
    const yes = ctx.polls.get(pollId)!.options.find((o) => o.label === "Yes")!.id
    ctx.votes[pollId] = { "admin-1": yes, u2: yes, u3: yes }

    const handlers = ctx.lifecycleHandlers.get("POLL_VOTE_CAST") ?? []
    await handlers[0]!({ roomId: ROOM, pollId, totalVotes: null })

    expect(ctx.api.closePoll).toHaveBeenCalledWith(
      expect.objectContaining({ pollId, announce: false }),
    )
  })

  it("quorum check uses online ids, not a full-room hydrate", async () => {
    const ctx = setup()
    await ctx.plugin.register(ctx.context)
    ctx.api.getNowPlaying.mockResolvedValue(makeTrack({ djId: "dj-1" }))
    await ctx.plugin.executeAction("startRound", ADMIN, { theme: "Theme" })

    const pollId = ctx.getActivePollId()!
    const yes = ctx.polls.get(pollId)!.options.find((o) => o.label === "Yes")!.id
    ctx.votes[pollId] = { "admin-1": yes, u2: yes, u3: yes }
    ctx.api.getUsers.mockClear()

    const handlers = ctx.lifecycleHandlers.get("POLL_VOTE_CAST") ?? []
    await handlers[0]!({ roomId: ROOM, pollId, totalVotes: null })

    expect(ctx.api.getOnlineUserIds).toHaveBeenCalled()
    expect(ctx.api.getUsers).not.toHaveBeenCalled()
  })

  it("decoy mode assigns decoy themes and includes Decoy option", async () => {
    const ctx = setup({ accusationReward: 2 })
    await ctx.plugin.register(ctx.context)
    const result = await ctx.plugin.executeAction("startRound", ADMIN, {
      theme: "Real theme",
      decoyTheme: "Fake theme",
      decoyCount: "2",
    })
    expect(result.success).toBe(true)

    const round = JSON.parse(ctx.storage.strings.get("round")!) as QueueThemeRound
    expect(round.decoyUserIds).toHaveLength(2)
    expect(round.decoyTheme).toBe("Fake theme")

    await (ctx.plugin as any).openPollForTrack(
      makeTrack({ djId: round.decoyUserIds[0] }),
      ADMIN.userId,
    )
    expect(ctx.api.createPoll).toHaveBeenCalledWith(
      expect.objectContaining({
        options: [{ label: "Yes" }, { label: "No" }, { label: "Decoy" }],
      }),
    )
  })

  it("rewards decoy accusations with one addScores per voter", async () => {
    const ctx = setup({ accusationReward: 2, coinPerNetVote: 1 })
    await ctx.plugin.register(ctx.context)
    await ctx.plugin.executeAction("startRound", ADMIN, {
      theme: "Real",
      decoyTheme: "Fake",
      decoyCount: "1",
    })

    const round = JSON.parse(ctx.storage.strings.get("round")!) as QueueThemeRound
    round.decoyUserIds = ["dj-1"]
    await ctx.storage.set("round", JSON.stringify(round))

    await (ctx.plugin as any).openPollForTrack(makeTrack({ djId: "dj-1" }), ADMIN.userId)
    const pollId = ctx.getActivePollId()!
    const poll = ctx.polls.get(pollId)!
    const decoy = poll.options.find((o) => o.label === "Decoy")!.id
    const yes = poll.options.find((o) => o.label === "Yes")!.id
    ctx.votes[pollId] = { u2: decoy, u3: yes }
    ctx.game.addScores.mockClear()

    const handlers = ctx.lifecycleHandlers.get("TRACK_CHANGED") ?? []
    await handlers[0]!({
      roomId: ROOM,
      track: makeTrack({ djId: "u2", trackId: "t2", title: "Next" }),
    })

    expect(ctx.game.addScores).toHaveBeenCalledWith(
      "u2",
      [
        { attribute: "coin", amount: 2 },
        { attribute: "score", amount: 2 },
      ],
      "queue-theme",
    )
    expect(ctx.game.addScores).toHaveBeenCalledTimes(2)
  })

  it("reserveQueue sets split on first unlocked queue item", async () => {
    const ctx = setup()
    await ctx.plugin.register(ctx.context)
    ctx.api.getQueue.mockResolvedValue([
      makeTrack({ trackId: "a", mediaSource: { type: "spotify", trackId: "a" } }),
      makeTrack({ trackId: "b", mediaSource: { type: "spotify", trackId: "b" } }),
    ])

    await ctx.plugin.executeAction("startRound", ADMIN, {
      theme: "Theme",
      reserveQueue: "true",
    })

    expect(ctx.api.setQueueSplit).toHaveBeenCalledWith(ROOM, "spotify:a")
  })

  it("endRound clears themes and closes open poll", async () => {
    const ctx = setup()
    await ctx.plugin.register(ctx.context)
    ctx.api.getNowPlaying.mockResolvedValue(makeTrack())
    await ctx.plugin.executeAction("startRound", ADMIN, { theme: "Theme" })
    expect(ctx.getActivePollId()).toBeTruthy()

    const result = await ctx.plugin.executeAction("endRound", ADMIN)
    expect(result.success).toBe(true)
    expect(ctx.api.closePoll).toHaveBeenCalled()
    expect(ctx.getActivePollId()).toBeNull()
    const assignment = await ctx.plugin.contributeToUserGameState("dj-1", { itemDefinitions: [] })
    expect(assignment).toMatchObject({ theme: null })
  })

  it("endRound closes an active poll even when round.pollId is desynced", async () => {
    const ctx = setup()
    await ctx.plugin.register(ctx.context)
    ctx.api.getNowPlaying.mockResolvedValue(makeTrack())
    await ctx.plugin.executeAction("startRound", ADMIN, { theme: "Theme" })
    const pollId = ctx.getActivePollId()
    expect(pollId).toBeTruthy()

    // Simulate desync: clear pollId on round while core poll remains open
    const raw = await ctx.storage.get("round")
    const round = JSON.parse(raw!) as QueueThemeRound
    round.pollId = null
    round.optionIds = null
    await ctx.storage.set("round", JSON.stringify(round))

    const result = await ctx.plugin.executeAction("endRound", ADMIN)
    expect(result.success).toBe(true)
    expect(ctx.api.closePoll).toHaveBeenCalledWith(
      expect.objectContaining({ pollId, announce: false }),
    )
    expect(ctx.getActivePollId()).toBeNull()
  })

  it("does not assign a brief to plugin-attributed ids from either late-joiner path", async () => {
    const ctx = setup()
    await ctx.plugin.register(ctx.context)
    await ctx.plugin.executeAction("startRound", ADMIN, { theme: "Driving" })

    const pluginId = "plugin:round-robin-dj"
    const fromContribute = await ctx.plugin.contributeToUserGameState(pluginId, {
      itemDefinitions: [],
    })
    expect(fromContribute).toEqual({ theme: null, isDecoy: false })
    expect(await ctx.storage.hget("briefs", pluginId)).toBeNull()

    const handlers = ctx.lifecycleHandlers.get("USER_JOINED") ?? []
    await handlers[0]!({
      roomId: ROOM,
      user: { userId: pluginId, username: "Robin" },
    })
    expect(await ctx.storage.hget("briefs", pluginId)).toBeNull()
    expect(ctx.api.sendUserSystemMessage).not.toHaveBeenCalledWith(
      ROOM,
      pluginId,
      expect.anything(),
    )
  })

  it("TRACK_CHANGED with zero votes pays nothing from the votes hash", async () => {
    const ctx = setup({ coinPerNetVote: 1 })
    await ctx.plugin.register(ctx.context)
    ctx.api.getNowPlaying.mockResolvedValue(makeTrack({ djId: "dj-1" }))
    await ctx.plugin.executeAction("startRound", ADMIN, { theme: "Theme" })

    const pollId = ctx.getActivePollId()!
    ctx.votes[pollId] = {}

    const handlers = ctx.lifecycleHandlers.get("TRACK_CHANGED") ?? []
    await handlers[0]!({
      roomId: ROOM,
      track: makeTrack({ djId: "u2", trackId: "t2", title: "Next" }),
    })

    expect(ctx.api.closePoll).toHaveBeenCalledWith(
      expect.objectContaining({ pollId, announce: false }),
    )
    expect(ctx.game.addScore).not.toHaveBeenCalled()
    expect(ctx.game.addScores).not.toHaveBeenCalled()
    expect(ctx.api.sendSystemMessage).toHaveBeenCalledWith(
      ROOM,
      expect.stringMatching(/no payout \(0 yes − 0 no\)/),
    )
  })
})
