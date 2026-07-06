import { randomUUID } from "node:crypto"
import type {
  ChatMessage,
  ChatMessageTransformResult,
  Plugin,
  PluginActionInitiator,
  PluginComponentSchema,
  PluginConfigSchema,
  PluginContext,
  SystemEventPayload,
} from "@repo/types"
import { isInclusiveMode, type ParticipationMode } from "@repo/game-logic"
import { BasePlugin } from "@repo/plugin-base"
import packageJson from "./package.json"
import {
  quizSessionsConfigSchema,
  defaultQuizSessionsConfig,
  type QuizSessionsConfig,
  type QuizSession,
  type QuizQuestion,
  type QuizLeaderboardEntry,
  type PublicQuizQuestion,
  type QuizSessionsEvents,
  type QuizSessionsComponentState,
} from "./types"
import { getComponentSchema, getConfigSchema } from "./schema"
import { formatLeaderboardChat, formatCorrectAnswerChat } from "./formatters"
import { isAcceptedAnswer } from "./matching"

export type { QuizSessionsConfig } from "./types"
export { quizSessionsConfigSchema, defaultQuizSessionsConfig } from "./types"
export { isAcceptedAnswer, normalizeAnswer } from "./matching"

/** Single active session per room (mirrors poll/game-session constraint). */
const SESSION_KEY = "session"
/** ZSET userId -> correct-answer count. Populated by the scoring path. */
const LEADERBOARD_KEY = "leaderboard"
/** HASH questionId -> winning userId. Atomic first-correct claim in PvP mode. */
const WINNERS_KEY = "winners"
/** HASH userId -> "1" for a question. Atomic per-user dedup in PvG mode. */
const answeredKey = (questionId: string): string => `answered:${questionId}`
/** Timer id for the auto-advance countdown after a correct answer. */
const AUTO_ADVANCE_TIMER = "auto-advance"
/** Short id (per-plugin) of the winner persona (ADR 0057). */
const WINNER_PERSONA_ID = "winner"

type ActionResult = { success: boolean; message?: string }

export class QuizSessionsPlugin extends BasePlugin<QuizSessionsConfig> {
  name = "quiz-sessions"
  version = packageJson.version
  description =
    "Run quiz rounds answered via chat, with PvP/PvG modes, coin scoring, and hot-potato personas."

  /** Cast avoids duplicate zod installs resolving to different `z` module instances under npm workspaces. */
  static readonly configSchema = quizSessionsConfigSchema as any
  static readonly defaultConfig = defaultQuizSessionsConfig

  getConfigSchema(): PluginConfigSchema {
    return getConfigSchema()
  }

  getComponentSchema(): PluginComponentSchema {
    return getComponentSchema()
  }

  /**
   * Hydrate the quiz UI for late joiners: the active question (card) + the
   * running leaderboard (game-state tab). `lastCorrectAnswer` is per-user and
   * event-driven, so it starts null on hydration.
   */
  async getComponentState(): Promise<QuizSessionsComponentState> {
    const empty: QuizSessionsComponentState = {
      activeQuestion: null,
      leaderboard: [],
      lastCorrectAnswer: null,
    }
    if (!this.context) return empty

    const session = await this.loadSession()
    if (!session) return empty

    return {
      activeQuestion: this.toPublicQuestion(session, session.activeQuestionIndex),
      leaderboard: await this.buildLeaderboard(),
      lastCorrectAnswer: null,
    }
  }

  async register(context: PluginContext): Promise<void> {
    await super.register(context)
    // PvP (competitive): observe chat post-broadcast; the winning guess stays visible.
    // PvG (inclusive) matching runs in transformChatMessage so correct guesses drop.
    this.on("MESSAGE_RECEIVED", (data) => this.onMessageReceived(data))
    // Register/unregister the hot-potato persona to track enable/disable + label
    // edits (ADR 0057). BasePlugin.cleanup() unregisters on teardown.
    await this.syncPersonas(await this.getConfig())
    this.onConfigChange(async () => {
      await this.syncPersonas(await this.getConfig())
    })
  }

  async executeAction(
    action: string,
    initiator?: PluginActionInitiator,
    params?: Record<string, unknown>,
  ): Promise<ActionResult> {
    switch (action) {
      case "startSession":
        return this.startSession(initiator)
      case "advanceQuestion":
        return this.advanceQuestion(initiator)
      case "addQuestion":
        return this.addQuestion(initiator, params)
      case "endSession":
        return this.endSession(initiator)
      case "updateReward":
        return this.updateReward(initiator, params)
      default:
        return { success: false, message: `Unknown action: ${action}` }
    }
  }

  // ==========================================================================
  // Lifecycle actions
  // ==========================================================================

  /**
   * Start a session from the (private) authored question bank in config — NOT
   * from action params (ADR 0068; question bank is a `private` `object-array`
   * config field). Advances directly to the first question.
   */
  private async startSession(initiator?: PluginActionInitiator): Promise<ActionResult> {
    const admin = await this.requireRoomAdmin(initiator)
    if (!admin.ok) return admin.result
    if (!this.context) return notInitialized()

    const config = await this.getConfig()
    if (!config?.enabled) {
      return { success: false, message: "Quiz Sessions is disabled." }
    }

    const bank = config.questions ?? []
    if (bank.length === 0) {
      return {
        success: false,
        message: "No questions authored. Add questions in the plugin settings first.",
      }
    }

    const questions: QuizQuestion[] = bank.map((q) => ({
      id: randomUUID(),
      text: q.text,
      acceptedAnswers: q.acceptedAnswers,
    }))

    const winnerEnabled = config.winnerLabel.trim().length > 0

    const session: QuizSession = {
      id: randomUUID(),
      questions,
      activeQuestionIndex: 0,
      mode: config.mode,
      autoAdvance: config.autoAdvance,
      autoAdvanceDelayMs: Math.max(0, Math.round(config.autoAdvanceDelaySec * 1000)),
      coinReward: config.coinReward,
      personaIds: winnerEnabled ? [WINNER_PERSONA_ID] : [],
      activePersonaIndex: winnerEnabled ? 0 : -1,
      startedAt: Date.now(),
      winnersPerQuestion: {},
    }

    this.clearTimer(AUTO_ADVANCE_TIMER)
    await this.context.storage.del(LEADERBOARD_KEY)
    await this.context.storage.del(WINNERS_KEY)
    await this.saveSession(session)

    await this.context.api.sendSystemMessage(
      this.context.roomId,
      `🧠 Quiz started — ${questions.length} question${questions.length === 1 ? "" : "s"}. Answer in chat!`,
    )

    await this.emit<QuizSessionsEvents["SESSION_STARTED"]>("SESSION_STARTED", {
      activeQuestion: this.toPublicQuestion(session, 0),
      leaderboard: [],
      lastCorrectAnswer: null,
    })

    return { success: true, message: `Quiz started with ${questions.length} questions.` }
  }

  /** Advance to the next question, or end the session if the current one is last. */
  private async advanceQuestion(initiator?: PluginActionInitiator): Promise<ActionResult> {
    const admin = await this.requireRoomAdmin(initiator)
    if (!admin.ok) return admin.result
    if (!this.context) return notInitialized()

    const session = await this.loadSession()
    if (!session) return { success: false, message: "No active quiz session." }

    return this.performAdvance(session)
  }

  /**
   * Advance/end without admin gating — shared by the admin action and the
   * auto-advance timer. Clears any pending auto-advance timer first so a manual
   * advance can't be double-fired by the countdown.
   */
  private async performAdvance(session: QuizSession): Promise<ActionResult> {
    if (!this.context) return notInitialized()
    this.clearTimer(AUTO_ADVANCE_TIMER)

    if (session.activeQuestionIndex >= session.questions.length - 1) {
      return this.finishSession(session)
    }

    session.activeQuestionIndex += 1
    await this.saveSession(session)

    const question = this.toPublicQuestion(session, session.activeQuestionIndex)
    if (question) {
      await this.emit<QuizSessionsEvents["QUESTION_ADVANCED"]>("QUESTION_ADVANCED", {
        activeQuestion: question,
      })
    }

    return { success: true, message: `Advanced to question ${session.activeQuestionIndex + 1}.` }
  }

  /**
   * Auto-advance timer callback. Advances only if the session is still on the
   * question the timer was scheduled for (guards against a manual advance/end
   * or a new session having moved on).
   */
  private async autoAdvance(fromQuestionIndex: number): Promise<void> {
    const session = await this.loadSession()
    if (!session || session.activeQuestionIndex !== fromQuestionIndex) return
    await this.performAdvance(session)
  }

  /** Append a question to the active session (live authoring during a running quiz). */
  private async addQuestion(
    initiator?: PluginActionInitiator,
    params?: Record<string, unknown>,
  ): Promise<ActionResult> {
    const admin = await this.requireRoomAdmin(initiator)
    if (!admin.ok) return admin.result
    if (!this.context) return notInitialized()

    const session = await this.loadSession()
    if (!session) return { success: false, message: "No active quiz session." }

    const text = typeof params?.text === "string" ? params.text.trim() : ""
    const acceptedAnswers = parseAcceptedAnswers(params?.acceptedAnswers)

    if (!text || acceptedAnswers.length === 0) {
      return { success: false, message: "A question needs text and at least one accepted answer." }
    }

    session.questions.push({ id: randomUUID(), text, acceptedAnswers })
    await this.saveSession(session)

    return { success: true, message: "Question added to the active quiz." }
  }

  /** Post the leaderboard to chat, clear state, and emit SESSION_ENDED. */
  private async endSession(initiator?: PluginActionInitiator): Promise<ActionResult> {
    const admin = await this.requireRoomAdmin(initiator)
    if (!admin.ok) return admin.result
    if (!this.context) return notInitialized()

    const session = await this.loadSession()
    if (!session) return { success: false, message: "No active quiz session." }

    return this.finishSession(session)
  }

  /**
   * End without admin gating — shared by the admin action and auto-advance past
   * the last question. The hot-potato persona is intentionally NOT stripped
   * here: it persists on the last winner until reassigned (a new session's first
   * correct answer) or the plugin is disabled (`unregisterPersonas`).
   */
  private async finishSession(session: QuizSession): Promise<ActionResult> {
    if (!this.context) return notInitialized()
    this.clearTimer(AUTO_ADVANCE_TIMER)

    const leaderboard = await this.buildLeaderboard()
    await this.context.api.sendSystemMessage(
      this.context.roomId,
      formatLeaderboardChat(leaderboard),
    )
    await this.clearSession()

    await this.emit<QuizSessionsEvents["SESSION_ENDED"]>("SESSION_ENDED", {
      results: { leaderboard },
      activeQuestion: null,
      leaderboard,
      lastCorrectAnswer: null,
    })

    return { success: true, message: "Quiz ended." }
  }

  /** Hot-update the coin reward on the active session. */
  private async updateReward(
    initiator?: PluginActionInitiator,
    params?: Record<string, unknown>,
  ): Promise<ActionResult> {
    const admin = await this.requireRoomAdmin(initiator)
    if (!admin.ok) return admin.result
    if (!this.context) return notInitialized()

    const session = await this.loadSession()
    if (!session) return { success: false, message: "No active quiz session." }

    const coinReward = Number(params?.coinReward)
    if (!Number.isFinite(coinReward) || coinReward < 0) {
      return { success: false, message: "Coin reward must be a non-negative number." }
    }

    session.coinReward = Math.round(coinReward)
    await this.saveSession(session)

    return { success: true, message: `Coin reward set to ${session.coinReward}.` }
  }

  // ==========================================================================
  // Answer detection + scoring
  // ==========================================================================

  /**
   * PvG (inclusive) answer path. Runs before broadcast so correct guesses are
   * dropped (no answer leak). Each user scores once per question; wrong guesses
   * pass through untouched.
   */
  async transformChatMessage(
    _roomId: string,
    message: ChatMessage,
  ): Promise<ChatMessageTransformResult> {
    if (!this.context) return null
    const config = await this.getConfig()
    if (!config?.enabled || !isInclusiveMode(config.mode)) return null
    if (this.isSystemMessage(message)) return null

    const session = await this.loadSession()
    const question = this.activeQuestion(session)
    if (!session || !question) return null
    if (!isAcceptedAnswer(message.content, question.acceptedAnswers)) return null

    // Atomic per-user dedup: only the first correct guess from this user scores,
    // but every correct guess is dropped so the answer never reaches chat.
    const firstTime = await this.context.storage.hsetnx(
      answeredKey(question.id),
      message.user.userId,
      "1",
    )
    if (firstTime) {
      await this.awardCorrect({ config, session, question, message, mode: "inclusive" })
      await this.saveSession(session)
    }

    return { drop: true, reason: "quiz-sessions-match" }
  }

  /**
   * PvP (competitive) answer path. The first correct guess for the active
   * question wins, reveals the answer, and stays visible in chat.
   */
  private async onMessageReceived(data: SystemEventPayload<"MESSAGE_RECEIVED">): Promise<void> {
    if (!this.context) return
    const config = await this.getConfig()
    if (!config?.enabled || isInclusiveMode(config.mode)) return
    const { message } = data
    if (this.isSystemMessage(message)) return

    const session = await this.loadSession()
    const question = this.activeQuestion(session)
    if (!session || !question) return
    if (!isAcceptedAnswer(message.content, question.acceptedAnswers)) return

    // Atomic first-winner claim guards against concurrent correct guesses.
    const claimed = await this.context.storage.hsetnx(WINNERS_KEY, question.id, message.user.userId)
    if (!claimed) return

    question.revealedAnswer = question.acceptedAnswers[0] ?? ""
    await this.awardCorrect({
      config,
      session,
      question,
      message,
      mode: "competitive",
      answer: question.revealedAnswer,
    })
    await this.saveSession(session)
  }

  private activeQuestion(session: QuizSession | null): QuizQuestion | null {
    if (!session || session.activeQuestionIndex < 0) return null
    return session.questions[session.activeQuestionIndex] ?? null
  }

  private isSystemMessage(message: ChatMessage): boolean {
    return message.user.userId === "system"
  }

  /**
   * Award a correct answer: bump the session leaderboard (+1), grant coins via
   * the game session (no-op without an active session), record the winner, and
   * announce it. Mutates `session` in memory — the caller persists it.
   */
  private async awardCorrect(params: {
    config: QuizSessionsConfig
    session: QuizSession
    question: QuizQuestion
    message: ChatMessage
    mode: ParticipationMode
    answer?: string
  }): Promise<void> {
    if (!this.context) return
    const { config, session, question, message, mode, answer } = params
    const userId = message.user.userId
    const username = message.user.username ?? undefined

    // Coins/score land only when a game session is active (ADR 0042); reflect
    // the actual award in the announcement. Awarding "score" feeds the global
    // game-session leaderboard alongside the quiz's own session leaderboard.
    const activeGame = await this.context.game.getActiveSession()
    const coins = activeGame ? session.coinReward : 0
    if (coins > 0) {
      await this.context.game.addScore(userId, "coin", coins, this.name)
      await this.context.game.addScore(userId, "score", coins, this.name)
    }

    await this.context.storage.zincrby(LEADERBOARD_KEY, 1, userId)
    ;(session.winnersPerQuestion[question.id] ??= []).push(userId)

    await this.context.api.sendSystemMessage(
      this.context.roomId,
      formatCorrectAnswerChat(config.correctAnswerTemplate, {
        username: username ?? userId,
        coins,
      }),
    )

    await this.emit<QuizSessionsEvents["CORRECT_ANSWER"]>("CORRECT_ANSWER", {
      userId,
      username,
      questionId: question.id,
      mode,
      ...(answer !== undefined ? { answer } : {}),
      // Refresh the card (picks up a PvP `revealedAnswer`; no reveal in PvG).
      activeQuestion: this.toPublicQuestion(session, session.activeQuestionIndex),
      lastCorrectAnswer: { userId, questionId: question.id },
    })

    const leaderboard = await this.buildLeaderboard()
    await this.emit<QuizSessionsEvents["LEADERBOARD_UPDATED"]>("LEADERBOARD_UPDATED", {
      leaderboard,
    })

    // Winner persona: PvP assigns exclusively (hot potato); PvG assigns to every
    // correct guesser without evicting prior holders (ADR 0057).
    const personaId = this.activePersonaId(session)
    if (personaId) {
      await this.personas.assign(userId, personaId, this.name)
      await this.emit<QuizSessionsEvents["PERSONA_ASSIGNED"]>("PERSONA_ASSIGNED", {
        userId,
        personaId,
      })
    }

    // Kick off the auto-advance countdown once per question (guarded so a second
    // PvG scorer doesn't reset the timer).
    this.scheduleAutoAdvance(session)
  }

  /** Start the auto-advance timer if enabled and not already counting down. */
  private scheduleAutoAdvance(session: QuizSession): void {
    if (!session.autoAdvance || session.autoAdvanceDelayMs <= 0) return
    if (this.getTimer(AUTO_ADVANCE_TIMER)) return
    const fromQuestionIndex = session.activeQuestionIndex
    this.startTimer(AUTO_ADVANCE_TIMER, {
      duration: session.autoAdvanceDelayMs,
      callback: () => this.autoAdvance(fromQuestionIndex),
    })
  }

  /** Short id of the session's active hot-potato persona, or `null`. */
  private activePersonaId(session: QuizSession): string | null {
    if (session.activePersonaIndex < 0) return null
    return session.personaIds[session.activePersonaIndex] ?? null
  }

  /** Register or unregister the winner persona based on current config. */
  private async syncPersonas(config: QuizSessionsConfig | null): Promise<void> {
    if (!this.context) return
    const label = config?.winnerLabel?.trim()
    if (config?.enabled && label) {
      const icon = config.winnerIcon?.trim()
      // PvP (competitive): exclusive — badge moves to the latest correct guesser.
      // PvG (inclusive): non-exclusive — every correct guesser keeps the badge.
      const exclusive = !isInclusiveMode(config.mode)
      await this.personas.registerPersonas([
        {
          id: WINNER_PERSONA_ID,
          label,
          ...(icon ? { icon } : {}),
          exclusive,
          decoratesUser: true,
          decoratesChatMessage: true,
        },
      ])
    } else {
      await this.personas.unregisterPersonas()
    }
  }

  // ==========================================================================
  // Storage + helpers
  // ==========================================================================

  private async loadSession(): Promise<QuizSession | null> {
    if (!this.context) return null
    const raw = await this.context.storage.get(SESSION_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as QuizSession
    } catch {
      return null
    }
  }

  private async saveSession(session: QuizSession): Promise<void> {
    if (!this.context) return
    await this.context.storage.set(SESSION_KEY, JSON.stringify(session))
  }

  private async clearSession(): Promise<void> {
    if (!this.context) return
    await this.context.storage.del(SESSION_KEY)
    await this.context.storage.del(LEADERBOARD_KEY)
    await this.context.storage.del(WINNERS_KEY)
  }

  private toPublicQuestion(session: QuizSession, index: number): PublicQuizQuestion | null {
    const question = session.questions[index]
    if (!question) return null
    return {
      id: question.id,
      text: question.text,
      index,
      total: session.questions.length,
      revealedAnswer: question.revealedAnswer,
    }
  }

  private async buildLeaderboard(): Promise<QuizLeaderboardEntry[]> {
    if (!this.context) return []
    const raw = await this.context.storage.zrangeWithScores(LEADERBOARD_KEY, 0, -1)
    const sorted = [...raw].sort((a, b) => b.score - a.score)
    const users = await this.context.api.getUsersByIds(sorted.map((e) => e.value))
    const nameById = new Map(users.map((u) => [u.userId, u.username]))
    return sorted.map((entry) => ({
      score: entry.score,
      value: entry.value,
      username: nameById.get(entry.value) ?? entry.value,
    }))
  }

  private async requireRoomAdmin(
    initiator?: PluginActionInitiator,
  ): Promise<{ ok: true } | { ok: false; result: ActionResult }> {
    if (!this.context) {
      return { ok: false, result: notInitialized() }
    }
    const userId = initiator?.userId?.trim()
    if (!userId) {
      return { ok: false, result: { success: false, message: "Admin required" } }
    }
    const isAdmin = await this.context.api.isRoomAdmin(this.context.roomId, userId)
    if (!isAdmin) {
      return { ok: false, result: { success: false, message: "Admin required" } }
    }
    return { ok: true }
  }
}

function notInitialized(): ActionResult {
  return { success: false, message: "Plugin not initialized" }
}

/**
 * Normalize the `acceptedAnswers` action param into a trimmed, de-duplicated,
 * non-empty string array. Accepts either a real array (programmatic callers) or
 * a comma-separated string (the admin UI form field, whose inputs are strings).
 */
function parseAcceptedAnswers(raw: unknown): string[] {
  const parts = Array.isArray(raw)
    ? raw.filter((a): a is string => typeof a === "string")
    : typeof raw === "string"
      ? raw.split(",")
      : []
  const seen = new Set<string>()
  const answers: string[] = []
  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    answers.push(trimmed)
  }
  return answers
}

export function createQuizSessionsPlugin(configOverrides?: Partial<QuizSessionsConfig>): Plugin {
  return new QuizSessionsPlugin(configOverrides)
}

export default createQuizSessionsPlugin
