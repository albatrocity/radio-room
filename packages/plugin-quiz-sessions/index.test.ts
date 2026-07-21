import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ChatMessage, PluginContext } from "@repo/types"
import { QuizSessionsPlugin } from "./index"
import { defaultQuizSessionsConfig, type QuizSessionsConfig, type QuizSession } from "./types"

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
    zrem: vi.fn(async (k: string, v: string) => {
      zsets.get(k)?.delete(v)
    }),
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

function setup(configOverrides: Partial<QuizSessionsConfig> = {}) {
  const storage = createInMemoryStorage()
  const config: QuizSessionsConfig = { ...defaultQuizSessionsConfig, ...configOverrides }

  const api = {
    isRoomAdmin: vi.fn(async () => true),
    sendSystemMessage: vi.fn(async () => {}),
    getUsersByIds: vi.fn(async (ids: string[]) => ids.map((id) => ({ userId: id, username: id }))),
    getPluginConfig: vi.fn(async () => config),
    emit: vi.fn(async () => {}),
    queueSoundEffect: vi.fn(async () => {}),
    queueScreenEffect: vi.fn(async () => {}),
  }

  const game = {
    getActiveSession: vi.fn(async () => ({ id: "game-1" }) as unknown),
    addScore: vi.fn(async () => 0),
  }

  const personas = {
    registerPersonas: vi.fn(async () => {}),
    unregisterPersonas: vi.fn(async () => {}),
    assign: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    getRoomPersonas: vi.fn(async () => []),
    getUserPersonas: vi.fn(async () => []),
    getUsersWithPersona: vi.fn(async () => []),
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
    game,
    personas,
    lifecycle,
  } as unknown as PluginContext

  const plugin = new QuizSessionsPlugin()
  return { plugin, context, api, storage, config, game, personas, lifecycleHandlers }
}

/** Flush the microtask queue so fire-and-forget timer callbacks settle. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/** Fire the registered MESSAGE_RECEIVED lifecycle handlers (PvP observer path). */
async function emitMessage(
  lifecycleHandlers: Map<string, Function[]>,
  content: string,
  user: { userId: string; username?: string },
): Promise<void> {
  const handlers = lifecycleHandlers.get("MESSAGE_RECEIVED") ?? []
  const message = { content, user } as unknown as ChatMessage
  for (const handler of handlers) {
    await handler({ roomId: ROOM, message })
  }
}

/** Build a chat message for the PvG transform path. */
function chatMessage(content: string, user: { userId: string; username?: string }): ChatMessage {
  return { content, user } as unknown as ChatMessage
}

function readSession(storage: ReturnType<typeof createInMemoryStorage>): QuizSession {
  const raw = storage.strings.get("session")
  if (!raw) throw new Error("no session stored")
  return JSON.parse(raw) as QuizSession
}

function emittedEvent(api: { emit: ReturnType<typeof vi.fn> }, name: string) {
  const call = api.emit.mock.calls.find((c) => c[0] === name)
  return call?.[1] as Record<string, any> | undefined
}

function lastEmittedEvent(api: { emit: ReturnType<typeof vi.fn> }, name: string) {
  const calls = api.emit.mock.calls.filter((c) => c[0] === name)
  return calls.at(-1)?.[1] as Record<string, any> | undefined
}

const QUESTIONS = [
  { text: "What song is this?", acceptedAnswers: ["Blue Monday"] },
  { text: "Who is the artist?", acceptedAnswers: ["New Order"] },
]

describe("QuizSessionsPlugin lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("startSession", () => {
    it("starts a runtime-only session from the private config question bank (no question copy)", async () => {
      const { plugin, context, api, storage } = setup({ enabled: true, questions: QUESTIONS })
      await plugin.register(context)

      const result = await plugin.executeAction("startSession", ADMIN)
      expect(result.success).toBe(true)

      const session = readSession(storage)
      // The question bank is read live from config — never copied into the session.
      expect(session).not.toHaveProperty("questions")
      expect(session.activeQuestionIndex).toBe(0)
      expect(session.mode).toBe(defaultQuizSessionsConfig.mode)
      expect(session.revealedAnswers).toEqual({})
      // Secrecy: no accepted answer is ever persisted in the session record.
      expect(JSON.stringify(session)).not.toContain("Blue Monday")

      expect(api.sendSystemMessage).toHaveBeenCalledWith(
        ROOM,
        expect.stringContaining("Quiz started"),
      )
    })

    it("refuses to start a second session while one is running", async () => {
      const { plugin, context } = setup({ enabled: true, questions: QUESTIONS })
      await plugin.register(context)
      await plugin.executeAction("startSession", ADMIN)

      const result = await plugin.executeAction("startSession", ADMIN)
      expect(result.success).toBe(false)
      expect(result.message).toContain("already running")
    })

    it("emits SESSION_STARTED with a public first question that omits accepted answers", async () => {
      const { plugin, context, api } = setup({ enabled: true, questions: QUESTIONS })
      await plugin.register(context)
      await plugin.executeAction("startSession", ADMIN)

      const payload = emittedEvent(api, "SESSION_STARTED")
      expect(payload).toBeTruthy()
      expect(payload!.activeQuestion.text).toBe(QUESTIONS[0]!.text)
      expect(payload!.activeQuestion.index).toBe(0)
      expect(payload!.activeQuestion.total).toBe(2)
      expect(payload!.activeQuestion).not.toHaveProperty("acceptedAnswers")
      expect(payload!.leaderboard).toEqual([])
    })

    it("fails when no questions are authored", async () => {
      const { plugin, context } = setup({ enabled: true, questions: [] })
      await plugin.register(context)
      const result = await plugin.executeAction("startSession", ADMIN)
      expect(result.success).toBe(false)
      expect(result.message).toContain("No questions authored")
    })

    it("fails when the plugin is disabled", async () => {
      const { plugin, context } = setup({ enabled: false, questions: QUESTIONS })
      await plugin.register(context)
      const result = await plugin.executeAction("startSession", ADMIN)
      expect(result.success).toBe(false)
      expect(result.message).toContain("disabled")
    })

    it("rejects a non-admin initiator", async () => {
      const { plugin, context, api } = setup({ enabled: true, questions: QUESTIONS })
      api.isRoomAdmin.mockResolvedValueOnce(false)
      await plugin.register(context)
      const result = await plugin.executeAction("startSession", { userId: "guest-1" })
      expect(result).toEqual({ success: false, message: "Admin required" })
    })

    it("rejects a missing initiator", async () => {
      const { plugin, context } = setup({ enabled: true, questions: QUESTIONS })
      await plugin.register(context)
      const result = await plugin.executeAction("startSession")
      expect(result).toEqual({ success: false, message: "Admin required" })
    })
  })

  describe("advanceQuestion", () => {
    it("advances to the next question and emits QUESTION_ADVANCED", async () => {
      const { plugin, context, api, storage } = setup({ enabled: true, questions: QUESTIONS })
      await plugin.register(context)
      await plugin.executeAction("startSession", ADMIN)
      api.emit.mockClear()

      const result = await plugin.executeAction("advanceQuestion", ADMIN)
      expect(result.success).toBe(true)
      expect(readSession(storage).activeQuestionIndex).toBe(1)

      const payload = emittedEvent(api, "QUESTION_ADVANCED")
      expect(payload!.activeQuestion.index).toBe(1)
      expect(payload!.activeQuestion.text).toBe(QUESTIONS[1]!.text)
      expect(payload!.activeQuestion).not.toHaveProperty("acceptedAnswers")
    })

    it("ends the session when advancing past the last question", async () => {
      const { plugin, context, api, storage } = setup({ enabled: true, questions: QUESTIONS })
      await plugin.register(context)
      await plugin.executeAction("startSession", ADMIN)
      await plugin.executeAction("advanceQuestion", ADMIN) // now on last (index 1)
      api.emit.mockClear()

      const result = await plugin.executeAction("advanceQuestion", ADMIN)
      expect(result.success).toBe(true)
      expect(storage.strings.has("session")).toBe(false)
      expect(emittedEvent(api, "SESSION_ENDED")).toBeTruthy()
    })

    it("fails with no active session", async () => {
      const { plugin, context } = setup({ enabled: true, questions: QUESTIONS })
      await plugin.register(context)
      const result = await plugin.executeAction("advanceQuestion", ADMIN)
      expect(result.success).toBe(false)
      expect(result.message).toContain("No active quiz session")
    })
  })

  describe("live question editing (config is source of truth)", () => {
    it("matches against the edited question bank without restarting the session", async () => {
      const ctx = setup({ enabled: true, mode: "inclusive", questions: QUESTIONS, coinReward: 10 })
      await ctx.plugin.register(ctx.context)
      await ctx.plugin.executeAction("startSession", ADMIN)
      const sessionId = readSession(ctx.storage).id

      // Admin edits the active question's accepted answers mid-show (new config).
      ctx.api.getPluginConfig = vi.fn(async () => ({
        ...defaultQuizSessionsConfig,
        enabled: true,
        mode: "inclusive" as const,
        coinReward: 10,
        questions: [
          { text: "What song is this?", acceptedAnswers: ["Bizarre Love Triangle"] },
          ...QUESTIONS.slice(1),
        ],
      }))
      ctx.game.addScore.mockClear()

      // The old answer no longer matches; the freshly-edited one does.
      const stale = await ctx.plugin.transformChatMessage(
        ROOM,
        chatMessage("blue monday", { userId: "u1" }),
      )
      expect(stale).toBeNull()
      const fresh = await ctx.plugin.transformChatMessage(
        ROOM,
        chatMessage("bizarre love triangle", { userId: "u1" }),
      )
      expect(fresh).toEqual({ drop: true, reason: "quiz-sessions-match" })
      expect(ctx.game.addScore).toHaveBeenCalledWith("u1", "coin", 10, "quiz-sessions")
      // Same session throughout — no restart.
      expect(readSession(ctx.storage).id).toBe(sessionId)
    })

    it("refreshes the active card when the question bank changes (CONFIG_CHANGED)", async () => {
      const ctx = setup({ enabled: true, mode: "inclusive", questions: QUESTIONS })
      await ctx.plugin.register(ctx.context)
      await ctx.plugin.executeAction("startSession", ADMIN)
      ctx.api.emit.mockClear()

      ctx.api.getPluginConfig = vi.fn(async () => ({
        ...defaultQuizSessionsConfig,
        enabled: true,
        mode: "inclusive" as const,
        questions: [{ text: "Edited question?", acceptedAnswers: ["x"] }, ...QUESTIONS.slice(1)],
      }))

      const handlers = ctx.lifecycleHandlers.get("CONFIG_CHANGED") ?? []
      for (const handler of handlers) {
        await handler({ roomId: ROOM, pluginName: "quiz-sessions", config: {}, previousConfig: { enabled: true } })
      }

      const advanced = lastEmittedEvent(ctx.api, "QUESTION_ADVANCED")
      expect(advanced!.activeQuestion.text).toBe("Edited question?")
      expect(advanced!.activeQuestion).not.toHaveProperty("acceptedAnswers")
    })

    it("clamps the active index when the current question is deleted", async () => {
      const ctx = setup({ enabled: true, mode: "inclusive", questions: QUESTIONS })
      await ctx.plugin.register(ctx.context)
      await ctx.plugin.executeAction("startSession", ADMIN)
      await ctx.plugin.executeAction("advanceQuestion", ADMIN) // active index 1

      // Delete everything after the first question.
      ctx.api.getPluginConfig = vi.fn(async () => ({
        ...defaultQuizSessionsConfig,
        enabled: true,
        mode: "inclusive" as const,
        questions: [QUESTIONS[0]!],
      }))

      const handlers = ctx.lifecycleHandlers.get("CONFIG_CHANGED") ?? []
      for (const handler of handlers) {
        await handler({ roomId: ROOM, pluginName: "quiz-sessions", config: {}, previousConfig: { enabled: true } })
      }

      expect(readSession(ctx.storage).activeQuestionIndex).toBe(0)
    })
  })

  describe("endSession", () => {
    it("posts the leaderboard, clears state, and emits SESSION_ENDED", async () => {
      const { plugin, context, api, storage } = setup({ enabled: true, questions: QUESTIONS })
      await plugin.register(context)
      await plugin.executeAction("startSession", ADMIN)
      api.sendSystemMessage.mockClear()

      const result = await plugin.executeAction("endSession", ADMIN)
      expect(result.success).toBe(true)
      expect(storage.strings.has("session")).toBe(false)
      expect(api.sendSystemMessage).toHaveBeenCalledWith(ROOM, expect.stringContaining("Quiz over"))
      expect(emittedEvent(api, "SESSION_ENDED")).toEqual({
        results: { leaderboard: [] },
        activeQuestion: null,
        leaderboard: [],
        lastCorrectAnswer: null,
      })
    })

    it("fails with no active session", async () => {
      const { plugin, context } = setup({ enabled: true, questions: QUESTIONS })
      await plugin.register(context)
      const result = await plugin.executeAction("endSession", ADMIN)
      expect(result.success).toBe(false)
    })
  })

  describe("updateReward", () => {
    it("hot-updates the coin reward on the active session", async () => {
      const { plugin, context, storage } = setup({
        enabled: true,
        questions: QUESTIONS,
        coinReward: 10,
      })
      await plugin.register(context)
      await plugin.executeAction("startSession", ADMIN)

      const result = await plugin.executeAction("updateReward", ADMIN, { coinReward: 25 })
      expect(result.success).toBe(true)
      expect(readSession(storage).coinReward).toBe(25)
    })

    it("rejects an invalid coin reward", async () => {
      const { plugin, context } = setup({ enabled: true, questions: QUESTIONS })
      await plugin.register(context)
      await plugin.executeAction("startSession", ADMIN)

      const result = await plugin.executeAction("updateReward", ADMIN, { coinReward: -5 })
      expect(result.success).toBe(false)
    })
  })

  describe("answer detection + scoring — PvP (competitive)", () => {
    async function startCompetitive(overrides: Partial<QuizSessionsConfig> = {}) {
      const ctx = setup({
        enabled: true,
        mode: "competitive",
        questions: QUESTIONS,
        coinReward: 10,
        ...overrides,
      })
      await ctx.plugin.register(ctx.context)
      await ctx.plugin.executeAction("startSession", ADMIN)
      ctx.api.emit.mockClear()
      ctx.api.sendSystemMessage.mockClear()
      ctx.api.queueSoundEffect.mockClear()
      ctx.api.queueScreenEffect.mockClear()
      ctx.game.addScore.mockClear()
      return ctx
    }

    it("awards the first correct guesser, reveals the answer, and announces it", async () => {
      const { plugin, api, storage, game, lifecycleHandlers } = await startCompetitive()

      await emitMessage(lifecycleHandlers, "  Blue MONDAY ", { userId: "u1", username: "Alice" })

      expect(game.addScore).toHaveBeenCalledWith("u1", "coin", 10, "quiz-sessions")
      expect(game.addScore).toHaveBeenCalledWith("u1", "score", 10, "quiz-sessions")

      const session = readSession(storage)
      const qid = `${session.id}:0`

      const correct = emittedEvent(api, "CORRECT_ANSWER")
      expect(correct).toMatchObject({ userId: "u1", mode: "competitive", answer: "Blue Monday" })
      // Card refresh: PvP reveals the answer to everyone.
      expect(correct!.activeQuestion.revealedAnswer).toBe("Blue Monday")
      expect(correct!.lastCorrectAnswer).toEqual({ userId: "u1", questionId: qid })

      const lb = lastEmittedEvent(api, "LEADERBOARD_UPDATED")
      expect(lb!.leaderboard).toEqual([{ score: 1, value: "u1", username: "u1" }])

      expect(api.sendSystemMessage).toHaveBeenCalledWith(ROOM, expect.stringContaining("+10 coins"))

      // PvP: sound plays room-wide (no userId).
      expect(api.queueSoundEffect).toHaveBeenCalledWith({
        url: "https://ross-brown.s3.amazonaws.com/broadcast/correct.mp3",
        volume: 0.3,
      })

      // PvP: card animation plays room-wide (no recipientUserId).
      expect(api.queueScreenEffect).toHaveBeenCalledWith({
        target: "plugin",
        targetId: "quiz-question-card",
        effect: "tada",
        duration: 500,
      })

      // Runtime keyed by question index (the config bank is not copied).
      expect(session.winnersPerQuestion["0"]).toEqual(["u1"])
      expect(session.revealedAnswers["0"]).toBe("Blue Monday")
    })

    it("does not play sound when soundEffectOnCorrect is disabled", async () => {
      const { api, lifecycleHandlers } = await startCompetitive({ soundEffectOnCorrect: false })

      await emitMessage(lifecycleHandlers, "Blue Monday", { userId: "u1", username: "Alice" })

      expect(emittedEvent(api, "CORRECT_ANSWER")).toBeDefined()
      expect(api.queueSoundEffect).not.toHaveBeenCalled()
      // Screen effect still runs (not gated on the sound toggle).
      expect(api.queueScreenEffect).toHaveBeenCalled()
    })

    it("ignores a later correct guess once the question is won", async () => {
      const { plugin, api, game, lifecycleHandlers } = await startCompetitive()

      await emitMessage(lifecycleHandlers, "Blue Monday", { userId: "u1", username: "Alice" })
      game.addScore.mockClear()
      api.queueSoundEffect.mockClear()
      api.queueScreenEffect.mockClear()

      await emitMessage(lifecycleHandlers, "Blue Monday", { userId: "u2", username: "Bob" })
      expect(game.addScore).not.toHaveBeenCalled()
      expect(api.queueSoundEffect).not.toHaveBeenCalled()
      expect(api.queueScreenEffect).not.toHaveBeenCalled()
    })

    it("ignores wrong guesses", async () => {
      const { api, game, lifecycleHandlers } = await startCompetitive()

      await emitMessage(lifecycleHandlers, "nope", { userId: "u1", username: "Alice" })
      expect(game.addScore).not.toHaveBeenCalled()
      expect(emittedEvent(api, "CORRECT_ANSWER")).toBeUndefined()
    })

    it("does not drop competitive messages via transformChatMessage", async () => {
      const { plugin } = await startCompetitive()
      const result = await plugin.transformChatMessage(
        ROOM,
        chatMessage("Blue Monday", { userId: "u1", username: "Alice" }),
      )
      expect(result).toBeNull()
    })
  })

  describe("answer detection + scoring — PvG (inclusive)", () => {
    async function startInclusive(overrides: Partial<QuizSessionsConfig> = {}) {
      const ctx = setup({
        enabled: true,
        mode: "inclusive",
        questions: QUESTIONS,
        coinReward: 10,
        ...overrides,
      })
      await ctx.plugin.register(ctx.context)
      await ctx.plugin.executeAction("startSession", ADMIN)
      ctx.api.emit.mockClear()
      ctx.api.sendSystemMessage.mockClear()
      ctx.api.queueSoundEffect.mockClear()
      ctx.api.queueScreenEffect.mockClear()
      ctx.game.addScore.mockClear()
      return ctx
    }

    it("drops a correct guess, awards coins, and omits the answer", async () => {
      const { plugin, api, game } = await startInclusive()

      const result = await plugin.transformChatMessage(
        ROOM,
        chatMessage("blue monday", { userId: "u1", username: "Alice" }),
      )

      expect(result).toEqual({ drop: true, reason: "quiz-sessions-match" })
      expect(game.addScore).toHaveBeenCalledWith("u1", "coin", 10, "quiz-sessions")

      const correct = emittedEvent(api, "CORRECT_ANSWER")
      expect(correct).toMatchObject({ userId: "u1", mode: "inclusive" })
      expect(correct).not.toHaveProperty("answer")
      // PvG is spoiler-safe: the card refresh carries no revealed answer.
      expect(correct!.activeQuestion.revealedAnswer).toBeUndefined()
      expect(correct!.lastCorrectAnswer.userId).toBe("u1")

      // PvG: sound plays only for the guesser.
      expect(api.queueSoundEffect).toHaveBeenCalledWith({
        url: "https://ross-brown.s3.amazonaws.com/broadcast/correct.mp3",
        volume: 0.3,
        userId: "u1",
      })

      // PvG: card animation plays only for the guesser.
      expect(api.queueScreenEffect).toHaveBeenCalledWith({
        target: "plugin",
        targetId: "quiz-question-card",
        effect: "tada",
        duration: 500,
        recipientUserId: "u1",
      })
    })

    it("does not play sound when soundEffectOnCorrect is disabled", async () => {
      const { plugin, api } = await startInclusive({ soundEffectOnCorrect: false })

      await plugin.transformChatMessage(
        ROOM,
        chatMessage("blue monday", { userId: "u1", username: "Alice" }),
      )

      expect(emittedEvent(api, "CORRECT_ANSWER")).toBeDefined()
      expect(api.queueSoundEffect).not.toHaveBeenCalled()
      expect(api.queueScreenEffect).toHaveBeenCalled()
    })

    it("rejects a duplicate correct guess from the same user but still drops it", async () => {
      const { plugin, game, api } = await startInclusive()

      await plugin.transformChatMessage(ROOM, chatMessage("blue monday", { userId: "u1" }))
      game.addScore.mockClear()
      api.queueSoundEffect.mockClear()
      api.queueScreenEffect.mockClear()

      const result = await plugin.transformChatMessage(
        ROOM,
        chatMessage("blue monday", { userId: "u1" }),
      )
      expect(result).toEqual({ drop: true, reason: "quiz-sessions-match" })
      expect(game.addScore).not.toHaveBeenCalled()
      expect(api.queueSoundEffect).not.toHaveBeenCalled()
      expect(api.queueScreenEffect).not.toHaveBeenCalled()
    })

    it("lets multiple users each score independently", async () => {
      const { plugin, api, game } = await startInclusive()

      await plugin.transformChatMessage(ROOM, chatMessage("blue monday", { userId: "u1" }))
      await plugin.transformChatMessage(ROOM, chatMessage("blue monday", { userId: "u2" }))

      // Each correct answer awards both "coin" and "score" → 2 calls per user.
      expect(game.addScore).toHaveBeenCalledTimes(4)
      expect(game.addScore).toHaveBeenCalledWith("u1", "score", 10, "quiz-sessions")
      expect(game.addScore).toHaveBeenCalledWith("u2", "score", 10, "quiz-sessions")
      const lb = lastEmittedEvent(api, "LEADERBOARD_UPDATED")
      expect(lb!.leaderboard).toEqual(
        expect.arrayContaining([
          { score: 1, value: "u1", username: "u1" },
          { score: 1, value: "u2", username: "u2" },
        ]),
      )
    })

    it("passes wrong guesses through untouched", async () => {
      const { plugin, game } = await startInclusive()
      const result = await plugin.transformChatMessage(ROOM, chatMessage("nope", { userId: "u1" }))
      expect(result).toBeNull()
      expect(game.addScore).not.toHaveBeenCalled()
    })

    it("returns null when no session is active", async () => {
      const { plugin } = setup({ enabled: true, mode: "inclusive", questions: QUESTIONS })
      // no startSession
      const result = await plugin.transformChatMessage(
        ROOM,
        chatMessage("blue monday", { userId: "u1" }),
      )
      expect(result).toBeNull()
    })
  })

  describe("coin reward announcement (independent of game session)", () => {
    it("announces the configured reward and attempts the award even with no active game session", async () => {
      const ctx = setup({ enabled: true, mode: "inclusive", questions: QUESTIONS, coinReward: 10 })
      // No active game session: addScore no-ops server-side, but the reward is
      // still the configured amount (regression: {{coins}} used to render 0).
      ctx.game.getActiveSession.mockResolvedValue(null)
      await ctx.plugin.register(ctx.context)
      await ctx.plugin.executeAction("startSession", ADMIN)
      ctx.api.sendSystemMessage.mockClear()
      ctx.game.addScore.mockClear()

      const result = await ctx.plugin.transformChatMessage(
        ROOM,
        chatMessage("blue monday", { userId: "u1", username: "Alice" }),
      )

      expect(result).toEqual({ drop: true, reason: "quiz-sessions-match" })
      expect(ctx.game.addScore).toHaveBeenCalledWith("u1", "coin", 10, "quiz-sessions")
      expect(ctx.game.addScore).toHaveBeenCalledWith("u1", "score", 10, "quiz-sessions")
      expect(ctx.api.sendSystemMessage).toHaveBeenCalledWith(
        ROOM,
        expect.stringContaining("+10 coins"),
      )
      const lb = lastEmittedEvent(ctx.api, "LEADERBOARD_UPDATED")
      expect(lb!.leaderboard).toEqual([{ score: 1, value: "u1", username: "u1" }])
    })
  })

  describe("hot-potato persona", () => {
    it("registers an exclusive persona in PvP (competitive) mode", async () => {
      const { plugin, context, personas } = setup({
        enabled: true,
        mode: "competitive",
        winnerLabel: "Hot Seat",
        winnerIcon: "Crown",
      })
      await plugin.register(context)
      expect(personas.registerPersonas).toHaveBeenCalledWith([
        expect.objectContaining({
          id: "winner",
          label: "Hot Seat",
          icon: "Crown",
          exclusive: true,
          decoratesUser: true,
          decoratesChatMessage: true,
        }),
      ])
    })

    it("registers a non-exclusive persona in PvG (inclusive) mode", async () => {
      const { plugin, context, personas } = setup({
        enabled: true,
        mode: "inclusive",
        winnerLabel: "Quiz Star",
      })
      await plugin.register(context)
      expect(personas.registerPersonas).toHaveBeenCalledWith([
        expect.objectContaining({
          id: "winner",
          label: "Quiz Star",
          exclusive: false,
        }),
      ])
    })

    it("does not register a persona when the label is empty", async () => {
      const { plugin, context, personas } = setup({ enabled: true, winnerLabel: "" })
      await plugin.register(context)
      expect(personas.registerPersonas).not.toHaveBeenCalled()
      expect(personas.unregisterPersonas).toHaveBeenCalled()
    })

    it("assigns the exclusive persona to the latest correct guesser (PvP)", async () => {
      const ctx = setup({
        enabled: true,
        mode: "competitive",
        questions: QUESTIONS,
        winnerLabel: "Hot Seat",
      })
      await ctx.plugin.register(ctx.context)
      await ctx.plugin.executeAction("startSession", ADMIN)
      ctx.api.emit.mockClear()
      ctx.personas.assign.mockClear()

      await emitMessage(ctx.lifecycleHandlers, "Blue Monday", { userId: "u1", username: "Alice" })

      expect(ctx.personas.assign).toHaveBeenCalledWith("u1", "winner", "quiz-sessions")
      expect(emittedEvent(ctx.api, "PERSONA_ASSIGNED")).toEqual({
        userId: "u1",
        personaId: "winner",
      })
    })

    it("assigns the persona to every correct guesser in PvG without removing prior holders", async () => {
      const ctx = setup({
        enabled: true,
        mode: "inclusive",
        questions: QUESTIONS,
        winnerLabel: "Quiz Star",
      })
      await ctx.plugin.register(ctx.context)
      await ctx.plugin.executeAction("startSession", ADMIN)
      ctx.personas.assign.mockClear()
      ctx.personas.remove.mockClear()

      await ctx.plugin.transformChatMessage(
        ROOM,
        chatMessage("blue monday", { userId: "u1", username: "Alice" }),
      )
      await ctx.plugin.transformChatMessage(
        ROOM,
        chatMessage("blue monday", { userId: "u2", username: "Bob" }),
      )

      expect(ctx.personas.assign).toHaveBeenCalledTimes(2)
      expect(ctx.personas.assign).toHaveBeenNthCalledWith(1, "u1", "winner", "quiz-sessions")
      expect(ctx.personas.assign).toHaveBeenNthCalledWith(2, "u2", "winner", "quiz-sessions")
      expect(ctx.personas.remove).not.toHaveBeenCalled()
    })

    it("does not clear the persona on question advance (persists until reassigned)", async () => {
      const ctx = setup({
        enabled: true,
        mode: "competitive",
        questions: QUESTIONS,
        winnerLabel: "Hot Seat",
      })
      await ctx.plugin.register(ctx.context)
      await ctx.plugin.executeAction("startSession", ADMIN)
      await emitMessage(ctx.lifecycleHandlers, "Blue Monday", { userId: "u1" })
      ctx.personas.remove.mockClear()

      await ctx.plugin.executeAction("advanceQuestion", ADMIN)
      expect(ctx.personas.remove).not.toHaveBeenCalled()
    })

    it("does not assign a persona when none is configured", async () => {
      const ctx = setup({ enabled: true, mode: "competitive", questions: QUESTIONS })
      await ctx.plugin.register(ctx.context)
      await ctx.plugin.executeAction("startSession", ADMIN)
      await emitMessage(ctx.lifecycleHandlers, "Blue Monday", { userId: "u1" })
      expect(ctx.personas.assign).not.toHaveBeenCalled()
    })
  })

  describe("self-start from config (segment activation / enable)", () => {
    async function fireConfigChanged(
      handlers: Map<string, Function[]>,
      previousConfig: Record<string, unknown>,
    ): Promise<void> {
      const list = handlers.get("CONFIG_CHANGED") ?? []
      for (const handler of list) {
        await handler({ roomId: ROOM, pluginName: "quiz-sessions", config: {}, previousConfig })
      }
    }

    it("starts a session when the quiz transitions to enabled with questions", async () => {
      const ctx = setup({ enabled: true, mode: "inclusive", questions: QUESTIONS })
      await ctx.plugin.register(ctx.context)
      ctx.api.emit.mockClear()

      await fireConfigChanged(ctx.lifecycleHandlers, { enabled: false })

      const session = readSession(ctx.storage)
      expect(session.activeQuestionIndex).toBe(0)
      expect(session).not.toHaveProperty("questions")
      expect(emittedEvent(ctx.api, "SESSION_STARTED")).toBeTruthy()
    })

    it("does not start when config was already enabled (unrelated save)", async () => {
      const ctx = setup({ enabled: true, questions: QUESTIONS })
      await ctx.plugin.register(ctx.context)

      await fireConfigChanged(ctx.lifecycleHandlers, { enabled: true })

      expect(() => readSession(ctx.storage)).toThrow()
    })

    it("does not clobber a running session on re-enable", async () => {
      const ctx = setup({ enabled: true, questions: QUESTIONS })
      await ctx.plugin.register(ctx.context)
      await ctx.plugin.executeAction("startSession", ADMIN)
      const first = readSession(ctx.storage)
      ctx.api.emit.mockClear()

      await fireConfigChanged(ctx.lifecycleHandlers, { enabled: false })

      expect(readSession(ctx.storage).id).toBe(first.id)
      expect(emittedEvent(ctx.api, "SESSION_STARTED")).toBeFalsy()
    })

    it("does nothing when enabled with an empty question bank", async () => {
      const ctx = setup({ enabled: true, questions: [] })
      await ctx.plugin.register(ctx.context)

      await fireConfigChanged(ctx.lifecycleHandlers, { enabled: false })

      expect(() => readSession(ctx.storage)).toThrow()
    })
  })

  describe("auto-advance", () => {
    it("advances after the delay when enabled (PvP)", async () => {
      const ctx = setup({
        enabled: true,
        mode: "competitive",
        questions: QUESTIONS,
        autoAdvance: true,
        autoAdvanceDelaySec: 5,
      })
      await ctx.plugin.register(ctx.context)
      await ctx.plugin.executeAction("startSession", ADMIN)
      await emitMessage(ctx.lifecycleHandlers, "Blue Monday", { userId: "u1" })
      ctx.api.emit.mockClear()

      expect(ctx.plugin.fireAllTimers()).toBe(1)
      await flush()
      expect(readSession(ctx.storage).activeQuestionIndex).toBe(1)
      expect(emittedEvent(ctx.api, "QUESTION_ADVANCED")).toBeTruthy()
    })

    it("does not schedule a timer when auto-advance is disabled", async () => {
      const ctx = setup({
        enabled: true,
        mode: "competitive",
        questions: QUESTIONS,
        autoAdvance: false,
      })
      await ctx.plugin.register(ctx.context)
      await ctx.plugin.executeAction("startSession", ADMIN)
      await emitMessage(ctx.lifecycleHandlers, "Blue Monday", { userId: "u1" })
      expect(ctx.plugin.fireAllTimers()).toBe(0)
      expect(readSession(ctx.storage).activeQuestionIndex).toBe(0)
    })

    it("manual advance cancels the pending auto-advance timer", async () => {
      const ctx = setup({
        enabled: true,
        mode: "competitive",
        questions: QUESTIONS,
        autoAdvance: true,
        autoAdvanceDelaySec: 5,
      })
      await ctx.plugin.register(ctx.context)
      await ctx.plugin.executeAction("startSession", ADMIN)
      await emitMessage(ctx.lifecycleHandlers, "Blue Monday", { userId: "u1" })
      await ctx.plugin.executeAction("advanceQuestion", ADMIN)

      expect(ctx.plugin.fireAllTimers()).toBe(0)
      expect(readSession(ctx.storage).activeQuestionIndex).toBe(1)
    })

    it("schedules a single timer for multiple PvG scorers on the same question", async () => {
      const ctx = setup({
        enabled: true,
        mode: "inclusive",
        questions: QUESTIONS,
        autoAdvance: true,
        autoAdvanceDelaySec: 5,
      })
      await ctx.plugin.register(ctx.context)
      await ctx.plugin.executeAction("startSession", ADMIN)
      await ctx.plugin.transformChatMessage(ROOM, chatMessage("blue monday", { userId: "u1" }))
      await ctx.plugin.transformChatMessage(ROOM, chatMessage("blue monday", { userId: "u2" }))

      expect(ctx.plugin.fireAllTimers()).toBe(1)
      await flush()
      expect(readSession(ctx.storage).activeQuestionIndex).toBe(1)
    })

    it("auto-advancing past the last question ends the session", async () => {
      const ctx = setup({
        enabled: true,
        mode: "competitive",
        questions: QUESTIONS,
        autoAdvance: true,
        autoAdvanceDelaySec: 5,
      })
      await ctx.plugin.register(ctx.context)
      await ctx.plugin.executeAction("startSession", ADMIN)
      await ctx.plugin.executeAction("advanceQuestion", ADMIN)
      await emitMessage(ctx.lifecycleHandlers, "New Order", { userId: "u1" })
      ctx.api.emit.mockClear()

      expect(ctx.plugin.fireAllTimers()).toBe(1)
      await flush()
      expect(ctx.storage.strings.has("session")).toBe(false)
      expect(emittedEvent(ctx.api, "SESSION_ENDED")).toBeTruthy()
    })
  })

  describe("getComponentState (late-joiner hydration)", () => {
    it("returns empty state when no session is active", async () => {
      const { plugin, context } = setup({ enabled: true, questions: QUESTIONS })
      await plugin.register(context)
      const state = await plugin.getComponentState()
      expect(state).toEqual({ activeQuestion: null, leaderboard: [], lastCorrectAnswer: null })
    })

    it("returns the active question and leaderboard for an in-progress quiz", async () => {
      const { plugin, context } = setup({
        enabled: true,
        mode: "inclusive",
        questions: QUESTIONS,
      })
      await plugin.register(context)
      await plugin.executeAction("startSession", ADMIN)
      await plugin.transformChatMessage(ROOM, chatMessage("blue monday", { userId: "u1" }))

      const state = await plugin.getComponentState()
      expect(state.activeQuestion?.index).toBe(0)
      expect(state.activeQuestion?.text).toBe(QUESTIONS[0]!.text)
      expect(state.activeQuestion).not.toHaveProperty("acceptedAnswers")
      // Secrecy: no accepted answer ever appears anywhere in the broadcast state.
      expect(JSON.stringify(state)).not.toContain("Blue Monday")
      expect(state.leaderboard).toEqual([{ score: 1, value: "u1", username: "u1" }])
      expect(state.lastCorrectAnswer).toBeNull()
    })
  })

  it("exposes a component schema with the aboveChat card + gameStateTab leaderboard", () => {
    const { plugin } = setup({ enabled: true })
    const schema = plugin.getComponentSchema()
    expect(schema.storeKeys).toEqual(["activeQuestion", "leaderboard", "lastCorrectAnswer"])
    const card = schema.components.find((c) => c.type === "quiz-question-card")
    expect(card?.area).toBe("aboveChat")
    const tab = schema.components.find((c) => c.type === "tab")
    expect(tab?.area).toBe("gameStateTab")
  })

  it("does not detect answers when the plugin is disabled", async () => {
    const { plugin, context, game, lifecycleHandlers } = setup({
      enabled: true,
      mode: "competitive",
      questions: QUESTIONS,
    })
    await plugin.register(context)
    await plugin.executeAction("startSession", ADMIN)
    // Disable after starting.
    context.api.getPluginConfig = vi.fn(async () => ({
      ...defaultQuizSessionsConfig,
      enabled: false,
    }))
    game.addScore.mockClear()

    await emitMessage(lifecycleHandlers, "Blue Monday", { userId: "u1" })
    expect(game.addScore).not.toHaveBeenCalled()
  })

  it("returns a failure for an unknown action", async () => {
    const { plugin, context } = setup({ enabled: true, questions: QUESTIONS })
    await plugin.register(context)
    const result = await plugin.executeAction("bogus", ADMIN)
    expect(result).toEqual({ success: false, message: "Unknown action: bogus" })
  })
})
