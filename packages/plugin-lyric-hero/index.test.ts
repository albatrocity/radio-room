import { describe, it, expect, vi, beforeEach } from "vitest"
import type { PluginContext } from "@repo/types"
import { LyricHeroPlugin } from "./index"
import { defaultLyricHeroConfig, type LyricHeroConfig, type LyricHeroSession } from "./types"

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
    hsetnx: vi.fn(async (k: string, f: string, v: string) => {
      if (!hashes.has(k)) hashes.set(k, new Map())
      const h = hashes.get(k)!
      if (h.has(f)) return false
      h.set(f, v)
      return true
    }),
    cleanup: vi.fn(async () => {}),
  }
}

function setup(configOverrides: Partial<LyricHeroConfig> = {}) {
  const storage = createInMemoryStorage()
  const config: LyricHeroConfig = {
    ...defaultLyricHeroConfig,
    enabled: true,
    phrases: [{ text: "don't stop" }, { text: "believin" }],
    ...configOverrides,
  }

  const api = {
    isRoomAdmin: vi.fn(async () => true),
    sendSystemMessage: vi.fn(async () => {}),
    sendUserSystemMessage: vi.fn(async () => {}),
    queueSoundEffect: vi.fn(async () => {}),
    getUsersByIds: vi.fn(async (ids: string[]) => ids.map((id) => ({ userId: id, username: id }))),
    getOnlineUserIds: vi.fn(async () => ["u1", "u2", "u3"]),
    getPluginConfig: vi.fn(async () => config),
    setPluginConfig: vi.fn(async () => {}),
    emit: vi.fn(async () => {}),
    emitToUser: vi.fn(async () => {}),
  }

  const game = {
    getActiveSession: vi.fn(async () => ({ id: "game-1" }) as unknown),
    addScore: vi.fn(async () => 0),
  }

  const lifecycle = {
    on: vi.fn(),
    off: vi.fn(),
  }

  const context = {
    roomId: ROOM,
    api,
    storage,
    game,
    lifecycle,
  } as unknown as PluginContext

  const plugin = new LyricHeroPlugin()
  return { plugin, context, api, storage, config, game }
}

async function start(plugin: LyricHeroPlugin, context: PluginContext) {
  await plugin.register(context)
  return plugin.executeAction("startSession", ADMIN)
}

/** Flush the microtask/macrotask queue so fire-and-forget timer callbacks settle. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function readSession(storage: ReturnType<typeof createInMemoryStorage>): LyricHeroSession {
  return JSON.parse(storage.strings.get("session")!) as LyricHeroSession
}

describe("LyricHeroPlugin", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("starts a cooperative session with a shared board", async () => {
    const { plugin, context, api } = setup({ mode: "cooperative" })
    const result = await start(plugin, context)
    expect(result.success).toBe(true)
    const session = readSession((context as any).storage)
    expect(session.mode).toBe("cooperative")
    expect(session.sharedBoard?.tokens).toHaveLength(2)
    expect(api.emit).toHaveBeenCalledWith(
      "SESSION_STARTED",
      expect.objectContaining({ roundActive: true, mode: "cooperative" }),
      undefined,
    )
  })

  it("fills all occurrences and rejects extra tokens", async () => {
    const { plugin, context, api, game } = setup({
      mode: "cooperative",
      phrases: [{ text: "run run away" }],
      solveReward: 10,
      guessBonus: 5,
    })
    await start(plugin, context)

    const multi = await plugin.executeAction("submitGuess", { userId: "u1", username: "A" }, {
      word: "run away",
    })
    expect(multi.success).toBe(false)
    expect(api.sendUserSystemMessage).toHaveBeenCalled()

    await plugin.executeAction("submitGuess", { userId: "u1", username: "A" }, { word: "run" })
    let session = readSession((context as any).storage)
    expect(session.sharedBoard!.tokens.filter((t) => t.revealed)).toHaveLength(2)

    await plugin.executeAction("submitGuess", { userId: "u2", username: "B" }, { word: "away" })
    session = readSession((context as any).storage)
    expect(session.sharedBoard!.solved).toBe(true)
    expect(session.acceptingGuesses).toBe(false)
    // All online get solveReward; fillers get bonuses
    expect(game.addScore).toHaveBeenCalled()
    expect(api.sendSystemMessage).toHaveBeenCalledWith(
      ROOM,
      expect.stringContaining("completed the lyric"),
    )
  })

  it("walks out after unique misses and reveals without payout", async () => {
    const { plugin, context, api, game } = setup({
      mode: "cooperative",
      missMax: 2,
      phrases: [{ text: "secret" }],
    })
    await start(plugin, context)
    game.addScore.mockClear()

    await plugin.executeAction("submitGuess", { userId: "u1", username: "A" }, { word: "nope" })
    await plugin.executeAction("submitGuess", { userId: "u1", username: "A" }, { word: "nope" })
    expect(api.sendUserSystemMessage).toHaveBeenCalledWith(
      ROOM,
      "u1",
      expect.stringContaining("already"),
    )

    await plugin.executeAction("submitGuess", { userId: "u1", username: "A" }, { word: "wrong" })
    const session = readSession((context as any).storage)
    expect(session.sharedBoard!.walkedOut).toBe(true)
    expect(session.acceptingGuesses).toBe(false)
    expect(game.addScore).not.toHaveBeenCalled()
    expect(api.sendSystemMessage).toHaveBeenCalledWith(ROOM, expect.stringContaining("leaving"))
  })

  it("queues crowd SFX by default and skips when playSoundEffects is false", async () => {
    const on = setup({
      mode: "cooperative",
      phrases: [{ text: "secret" }],
    })
    await start(on.plugin, on.context)
    await on.plugin.executeAction("submitGuess", { userId: "u1", username: "A" }, { word: "nope" })
    expect(on.api.queueSoundEffect).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining("/assets/sfx/") }),
    )

    const off = setup({
      mode: "cooperative",
      phrases: [{ text: "secret" }],
      playSoundEffects: false,
    })
    await start(off.plugin, off.context)
    await off.plugin.executeAction("submitGuess", { userId: "u1", username: "A" }, { word: "nope" })
    expect(off.api.sendSystemMessage).toHaveBeenCalled()
    expect(off.api.queueSoundEffect).not.toHaveBeenCalled()
  })

  it("competitive: first solve wins exclusively", async () => {
    const { plugin, context, api, game } = setup({
      mode: "competitive",
      phrases: [{ text: "one two" }],
      solveReward: 10,
      guessBonus: 5,
    })
    await start(plugin, context)

    await plugin.executeAction("submitGuess", { userId: "u1", username: "A" }, { word: "one" })
    await plugin.executeAction("submitGuess", { userId: "u1", username: "A" }, { word: "two" })

    expect(api.sendSystemMessage).toHaveBeenCalledWith(ROOM, expect.stringContaining("takes it"))
    expect(game.addScore).toHaveBeenCalledWith("u1", "coin", 10, "lyric-hero")
    // guessBonus for 2 words
    expect(game.addScore).toHaveBeenCalledWith("u1", "coin", 10, "lyric-hero")

    const blocked = await plugin.executeAction(
      "submitGuess",
      { userId: "u2", username: "B" },
      { word: "one" },
    )
    expect(blocked.success).toBe(false)
  })

  it("inclusive: two solvers both get paid; phrase not revealed in public finish line", async () => {
    const { plugin, context, api, game } = setup({
      mode: "inclusive",
      phrases: [{ text: "yes" }],
      solveReward: 7,
      guessBonus: 0,
    })
    await start(plugin, context)

    await plugin.executeAction("submitGuess", { userId: "u1", username: "A" }, { word: "yes" })
    await plugin.executeAction("submitGuess", { userId: "u2", username: "B" }, { word: "yes" })

    expect(game.addScore).toHaveBeenCalledWith("u1", "coin", 7, "lyric-hero")
    expect(game.addScore).toHaveBeenCalledWith("u2", "coin", 7, "lyric-hero")
    expect(api.sendSystemMessage).toHaveBeenCalledWith(
      ROOM,
      expect.stringContaining("finished the lyric"),
    )
    // Public finish must not include the phrase text
    const finishCalls = api.sendSystemMessage.mock.calls.filter((c) =>
      String(c[1]).includes("finished the lyric"),
    )
    for (const call of finishCalls) {
      expect(String(call[1])).not.toContain("yes")
    }
    expect(api.emitToUser).toHaveBeenCalled()
  })

  it("auto-advances after the delay when a cooperative phrase is solved", async () => {
    const { plugin, context, api } = setup({
      mode: "cooperative",
      phrases: [{ text: "one" }, { text: "two" }],
      autoAdvance: true,
      autoAdvanceDelaySec: 5,
    })
    await start(plugin, context)

    await plugin.executeAction("submitGuess", { userId: "u1", username: "A" }, { word: "one" })
    const session = readSession((context as any).storage)
    expect(session.autoAdvanceDeadline).toMatchObject({
      startAt: expect.any(Number),
      endAt: expect.any(Number),
    })
    expect(session.autoAdvanceDeadline!.endAt - session.autoAdvanceDeadline!.startAt).toBe(5000)
    expect(api.emit).toHaveBeenCalledWith(
      "PUZZLE_UPDATED",
      expect.objectContaining({
        autoAdvanceDeadline: session.autoAdvanceDeadline,
      }),
      expect.anything(),
    )

    api.emit.mockClear()
    expect(plugin.fireAllTimers()).toBe(1)
    await flush()

    const advanced = readSession((context as any).storage)
    expect(advanced.activePhraseIndex).toBe(1)
    expect(advanced.acceptingGuesses).toBe(true)
    expect(advanced.autoAdvanceDeadline).toBeNull()
    expect(api.emit).toHaveBeenCalledWith(
      "PHRASE_ADVANCED",
      expect.objectContaining({
        phraseIndex: 1,
        autoAdvanceDeadline: null,
      }),
      expect.anything(),
    )
  })

  it("does not schedule auto-advance when disabled", async () => {
    const { plugin, context, api } = setup({
      mode: "cooperative",
      phrases: [{ text: "one" }, { text: "two" }],
      autoAdvance: false,
    })
    await start(plugin, context)
    await plugin.executeAction("submitGuess", { userId: "u1", username: "A" }, { word: "one" })
    expect(readSession((context as any).storage).autoAdvanceDeadline).toBeNull()
    expect(plugin.fireAllTimers()).toBe(0)
    expect(api.emit).toHaveBeenCalledWith(
      "PUZZLE_UPDATED",
      expect.objectContaining({ autoAdvanceDeadline: null }),
      expect.anything(),
    )
  })

  it("exposes component schema with aboveChat card", () => {
    const plugin = new LyricHeroPlugin()
    const schema = plugin.getComponentSchema()
    const card = schema.components.find((c) => c.id === "lyric-hero-card")
    expect(card?.area).toBe("aboveChat")
    expect(card?.type).toBe("lyric-hero-card")
  })
})
