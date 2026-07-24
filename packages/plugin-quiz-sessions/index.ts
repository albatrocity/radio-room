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
  type QuizConfigQuestion,
  type QuizSession,
  type QuizLeaderboardEntry,
  type PublicQuizQuestion,
  type QuizSessionsEvents,
  type QuizSessionsComponentState,
  type QuizAutoAdvanceDeadline,
} from "./types"
import { getComponentSchema, getConfigSchema } from "./schema"
import { formatLeaderboardChat, formatCorrectAnswerChat } from "./formatters"
import { isAcceptedAnswer, matchAcceptedAnswer } from "./matching"
import { parseQuizQuestionsImport } from "./importParse"

export type { QuizSessionsConfig } from "./types"
export { quizSessionsConfigSchema, defaultQuizSessionsConfig } from "./types"
export { isAcceptedAnswer, matchAcceptedAnswer, normalizeAnswer } from "./matching"

/** Single active session per room (mirrors poll/game-session constraint). */
const SESSION_KEY = "session"
/** ZSET userId -> correct-answer count. Populated by the scoring path. */
const LEADERBOARD_KEY = "leaderboard"
/** HASH question index -> winning userId. Atomic first-correct claim (PvP). Cleared per session. */
const WINNERS_KEY = "winners"
/** HASH `${index}:${userId}` -> "1". Atomic per-user dedup (PvG). Cleared per session. */
const ANSWERED_KEY = "answered"
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
      autoAdvanceDeadline: null,
    }
    if (!this.context) return empty

    const session = await this.loadSession()
    if (!session) return empty

    const questions = await this.loadQuestions()
    return {
      activeQuestion: this.toPublicQuestion(questions, session, session.activeQuestionIndex),
      leaderboard: await this.buildLeaderboard(),
      lastCorrectAnswer: null,
      autoAdvanceDeadline: this.activeAutoAdvanceDeadline(session),
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
    this.onConfigChange(async (data) => {
      const config = await this.getConfig()
      await this.syncPersonas(config)
      await this.maybeSelfStart(config, data.previousConfig)
      // Live authoring: an admin editing the question bank in the settings modal
      // writes the room's (private) config and fires CONFIG_CHANGED. Re-broadcast
      // the active question so the card reflects edited text / new totals mid-show.
      if (config) await this.refreshActiveCard(config)
    })
  }

  /**
   * Self-start a session from config (ADR 0068 §5) — the path used by segment
   * activation and by an admin enabling the quiz in room settings. Fires only on
   * the disabled→enabled transition, with questions authored and no session
   * already running, so it never restarts on an unrelated save or clobbers a
   * live quiz. The deliberate admin "Start quiz" action bypasses this guard.
   */
  private async maybeSelfStart(
    config: QuizSessionsConfig | null,
    previousConfig: Record<string, unknown> | undefined,
  ): Promise<void> {
    if (!this.context || !config?.enabled) return
    const wasEnabled = (previousConfig as { enabled?: unknown } | undefined)?.enabled === true
    if (wasEnabled) return
    if ((config.questions ?? []).length === 0) return
    if (await this.loadSession()) return
    await this.startSessionFromConfig(config)
  }

  /**
   * Re-broadcast the active question after a config change so live edits to the
   * (private) question bank show up on the card without waiting for the next
   * advance. If the bank shrank below the active index (admin deleted the current
   * question), clamp so the card doesn't point past the end. The public question
   * id is session-scoped, so re-emitting the same question is idempotent on the
   * client (no remount, no clobbering of the per-user "You got it!" state).
   */
  private async refreshActiveCard(config: QuizSessionsConfig): Promise<void> {
    if (!this.context) return
    const session = await this.loadSession()
    if (!session) return

    const questions = config.questions ?? []
    if (questions.length === 0) return

    const clampedIndex = Math.min(session.activeQuestionIndex, questions.length - 1)
    if (clampedIndex !== session.activeQuestionIndex) {
      session.activeQuestionIndex = clampedIndex
      await this.saveSession(session)
    }

    const question = this.toPublicQuestion(questions, session, session.activeQuestionIndex)
    if (question) {
      await this.emit<QuizSessionsEvents["QUESTION_ADVANCED"]>("QUESTION_ADVANCED", {
        activeQuestion: question,
        // Config refresh must not clear an in-flight countdown.
        autoAdvanceDeadline: this.activeAutoAdvanceDeadline(session),
      })
    }
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
      case "endSession":
        return this.endSession(initiator)
      case "updateReward":
        return this.updateReward(initiator, params)
      default:
        return super.executeAction(action, initiator, params)
    }
  }

  protected parseConfigImportRows(action: string, rawText: string) {
    if (action !== "importQuestions") {
      return { ok: false as const, message: `No config import parser for action: ${action}` }
    }
    const rows = parseQuizQuestionsImport(rawText)
    return { ok: true as const, rows }
  }

  applyConfigImport(input: {
    action: string
    rawText: string
    mode: string
    existingValue?: unknown
  }) {
    const result = super.applyConfigImport(input)
    if (!result.success || result.count == null) return result
    const count = result.count
    const message =
      input.mode === "replace"
        ? `Replaced with ${count} question${count === 1 ? "" : "s"}`
        : `Appended ${count} question${count === 1 ? "" : "s"}`
    return { ...result, message }
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

    // One session per room: edits to a running quiz happen live via the settings
    // modal; a fresh run requires ending the current one first.
    if (await this.loadSession()) {
      return {
        success: false,
        message: "A quiz is already running. End it before starting a new one.",
      }
    }

    return this.startSessionFromConfig(config)
  }

  /**
   * Seed and start a session from the (private) authored question bank in merged
   * config — shared by the admin `startSession` action and config-driven
   * self-start (`maybeSelfStart`). Callers gate admin/enable; this only seeds.
   */
  private async startSessionFromConfig(config: QuizSessionsConfig): Promise<ActionResult> {
    if (!this.context) return notInitialized()

    const questions = config.questions ?? []
    if (questions.length === 0) {
      return {
        success: false,
        message: "No questions authored. Add questions in the plugin settings first.",
      }
    }

    const winnerEnabled = config.winnerLabel.trim().length > 0

    // Runtime only — the question bank is read live from config, never copied.
    const session: QuizSession = {
      id: randomUUID(),
      activeQuestionIndex: 0,
      mode: config.mode,
      autoAdvance: config.autoAdvance,
      autoAdvanceDelayMs: Math.max(0, Math.round(config.autoAdvanceDelaySec * 1000)),
      coinReward: config.coinReward,
      personaIds: winnerEnabled ? [WINNER_PERSONA_ID] : [],
      activePersonaIndex: winnerEnabled ? 0 : -1,
      startedAt: Date.now(),
      winnersPerQuestion: {},
      revealedAnswers: {},
      autoAdvanceDeadline: null,
    }

    this.clearTimer(AUTO_ADVANCE_TIMER)
    await this.context.storage.del(LEADERBOARD_KEY)
    await this.context.storage.del(WINNERS_KEY)
    await this.context.storage.del(ANSWERED_KEY)
    await this.saveSession(session)

    await this.context.api.sendSystemMessage(
      this.context.roomId,
      `🧠 Quiz started — ${questions.length} question${questions.length === 1 ? "" : "s"}. Answer in chat!`,
    )

    await this.emit<QuizSessionsEvents["SESSION_STARTED"]>("SESSION_STARTED", {
      activeQuestion: this.toPublicQuestion(questions, session, 0),
      leaderboard: [],
      lastCorrectAnswer: null,
      autoAdvanceDeadline: null,
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

    return this.performAdvance(session, await this.loadQuestions())
  }

  /**
   * Advance/end without admin gating — shared by the admin action and the
   * auto-advance timer. Clears any pending auto-advance timer first so a manual
   * advance can't be double-fired by the countdown. `questions` is the live
   * (config) bank, so mid-show edits change the end-of-quiz boundary.
   */
  private async performAdvance(
    session: QuizSession,
    questions: QuizConfigQuestion[],
  ): Promise<ActionResult> {
    if (!this.context) return notInitialized()
    this.clearTimer(AUTO_ADVANCE_TIMER)
    session.autoAdvanceDeadline = null

    if (session.activeQuestionIndex >= questions.length - 1) {
      return this.finishSession(session)
    }

    session.activeQuestionIndex += 1
    await this.saveSession(session)

    const question = this.toPublicQuestion(questions, session, session.activeQuestionIndex)
    if (question) {
      await this.emit<QuizSessionsEvents["QUESTION_ADVANCED"]>("QUESTION_ADVANCED", {
        activeQuestion: question,
        autoAdvanceDeadline: null,
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
    await this.performAdvance(session, await this.loadQuestions())
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
    session.autoAdvanceDeadline = null

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
      autoAdvanceDeadline: null,
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
    const questions = config.questions ?? []
    const active = this.resolveActiveQuestion(questions, session)
    if (!session || !active) return null
    if (!isAcceptedAnswer(message.content, active.question.acceptedAnswers)) return null

    // Atomic per-user dedup: only the first correct guess from this user scores,
    // but every correct guess is dropped so the answer never reaches chat.
    const firstTime = await this.context.storage.hsetnx(
      ANSWERED_KEY,
      `${active.index}:${message.user.userId}`,
      "1",
    )
    if (firstTime) {
      await this.awardCorrect({
        config,
        session,
        questions,
        index: active.index,
        message,
        mode: "inclusive",
      })
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
    const questions = config.questions ?? []
    const active = this.resolveActiveQuestion(questions, session)
    if (!session || !active) return
    const answer = matchAcceptedAnswer(message.content, active.question.acceptedAnswers)
    if (!answer) return

    // Atomic first-winner claim guards against concurrent correct guesses.
    const claimed = await this.context.storage.hsetnx(
      WINNERS_KEY,
      String(active.index),
      message.user.userId,
    )
    if (!claimed) return

    session.revealedAnswers[String(active.index)] = answer
    await this.awardCorrect({
      config,
      session,
      questions,
      index: active.index,
      message,
      mode: "competitive",
      answer,
    })
    await this.saveSession(session)
  }

  /** Resolve the live active question (from the config bank) for the session. */
  private resolveActiveQuestion(
    questions: QuizConfigQuestion[],
    session: QuizSession | null,
  ): { index: number; question: QuizConfigQuestion } | null {
    if (!session || session.activeQuestionIndex < 0) return null
    const question = questions[session.activeQuestionIndex]
    if (!question) return null
    return { index: session.activeQuestionIndex, question }
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
    questions: QuizConfigQuestion[]
    index: number
    message: ChatMessage
    mode: ParticipationMode
    answer?: string
  }): Promise<void> {
    if (!this.context) return
    const { config, session, questions, index, message, mode, answer } = params
    const userId = message.user.userId
    const username = message.user.username ?? undefined
    const questionId = this.questionId(session, index)

    // Announce (and attempt to award) the configured coin reward. `addScore`
    // no-ops gracefully when no game session is running (ADR 0042), so the
    // chat message reflects the reward regardless. Awarding "score" feeds the
    // global game-session leaderboard alongside the quiz's own leaderboard.
    const coins = session.coinReward
    if (coins > 0) {
      await this.context.game.addScore(userId, "coin", coins, this.name)
      await this.context.game.addScore(userId, "score", coins, this.name)
    }

    await this.context.storage.zincrby(LEADERBOARD_KEY, 1, userId)
    ;(session.winnersPerQuestion[String(index)] ??= []).push(userId)

    await this.context.api.sendSystemMessage(
      this.context.roomId,
      formatCorrectAnswerChat(config.correctAnswerTemplate, {
        username: username ?? userId,
        coins,
      }),
    )

    // Kick off the auto-advance countdown once per question (before CORRECT_ANSWER
    // so the ExpiryBar window rides on the same store update).
    const autoAdvanceDeadline = this.beginAutoAdvance(session)

    await this.emit<QuizSessionsEvents["CORRECT_ANSWER"]>("CORRECT_ANSWER", {
      userId,
      username,
      questionId,
      mode,
      ...(answer !== undefined ? { answer } : {}),
      // Refresh the card (picks up a PvP `revealedAnswer`; no reveal in PvG).
      activeQuestion: this.toPublicQuestion(questions, session, index),
      lastCorrectAnswer: { userId, questionId },
      autoAdvanceDeadline,
    })

    const leaderboard = await this.buildLeaderboard()
    await this.emit<QuizSessionsEvents["LEADERBOARD_UPDATED"]>("LEADERBOARD_UPDATED", {
      leaderboard,
    })

    if (config.soundEffectOnCorrect) {
      const url = config.soundEffectOnCorrectUrl ?? ""
      if (mode === "inclusive") {
        await this.context.api.queueSoundEffect({ url, volume: 0.3, userId })
      } else {
        await this.context.api.queueSoundEffect({ url, volume: 0.3 })
      }
    }

    await this.context.api.queueScreenEffect({
      target: "plugin",
      targetId: "quiz-question-card",
      effect: "tada",
      duration: 1000,
      ...(mode === "inclusive" ? { recipientUserId: userId } : {}),
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
  }

  /**
   * Start the auto-advance timer if enabled and not already counting down.
   * Mutates `session.autoAdvanceDeadline` when a new timer starts.
   */
  private beginAutoAdvance(session: QuizSession): QuizAutoAdvanceDeadline | null {
    if (!session.autoAdvance || session.autoAdvanceDelayMs <= 0) {
      session.autoAdvanceDeadline = null
      return null
    }
    if (this.getTimer(AUTO_ADVANCE_TIMER)) {
      return this.activeAutoAdvanceDeadline(session)
    }
    const startAt = Date.now()
    const endAt = startAt + session.autoAdvanceDelayMs
    session.autoAdvanceDeadline = { startAt, endAt }
    const fromQuestionIndex = session.activeQuestionIndex
    this.startTimer(AUTO_ADVANCE_TIMER, {
      duration: session.autoAdvanceDelayMs,
      callback: () => this.autoAdvance(fromQuestionIndex),
    })
    return session.autoAdvanceDeadline
  }

  /** Deadline still in the future, or null if idle/expired. */
  private activeAutoAdvanceDeadline(
    session: QuizSession,
  ): QuizAutoAdvanceDeadline | null {
    const deadline = session.autoAdvanceDeadline
    if (!deadline || deadline.endAt <= Date.now()) return null
    return deadline
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
    await this.context.storage.del(ANSWERED_KEY)
  }

  /** Read the live (private) question bank from merged config. */
  private async loadQuestions(): Promise<QuizConfigQuestion[]> {
    const config = await this.getConfig()
    return config?.questions ?? []
  }

  /**
   * Session-scoped public id for a question position. Scoping by session id keeps
   * the client's per-question "You got it!" state from bleeding across sessions
   * that reuse the same index (index 0 of a new quiz != index 0 of the old one).
   */
  private questionId(session: QuizSession, index: number): string {
    return `${session.id}:${index}`
  }

  private toPublicQuestion(
    questions: QuizConfigQuestion[],
    session: QuizSession,
    index: number,
  ): PublicQuizQuestion | null {
    const question = questions[index]
    if (!question) return null
    const revealedAnswer = session.revealedAnswers[String(index)]
    return {
      id: this.questionId(session, index),
      text: question.text,
      index,
      total: questions.length,
      ...(revealedAnswer !== undefined ? { revealedAnswer } : {}),
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

export function createQuizSessionsPlugin(configOverrides?: Partial<QuizSessionsConfig>): Plugin {
  return new QuizSessionsPlugin(configOverrides)
}

export default createQuizSessionsPlugin
