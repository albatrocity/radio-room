import { randomUUID } from "node:crypto"
import type {
  ContributeToUserGameStateContext,
  Plugin,
  PluginActionInitiator,
  PluginComponentSchema,
  PluginConfigSchema,
  PluginContext,
} from "@repo/types"
import { BasePlugin, fetchTopZsetEntries, HOT_LEADERBOARD_TOP_N } from "@repo/plugin-base"
import packageJson from "./package.json"
import { applyGuess, createBoard, revealAll, toPublicPuzzleView } from "./board"
import { crowdMoodFeedback, type CrowdMoodKind } from "./crowdMood"
import { parseLyricPhrasesImport } from "./importParse"
import { parseSingleGuess } from "./matching"
import { getComponentSchema, getConfigSchema } from "./schema"
import {
  LYRIC_HERO_PLUGIN_NAME,
  defaultLyricHeroConfig,
  lyricHeroConfigSchema,
  type LyricHeroAutoAdvanceDeadline,
  type LyricHeroComponentState,
  type LyricHeroConfig,
  type LyricHeroEvents,
  type LyricHeroLeaderboardEntry,
  type LyricHeroMode,
  type LyricHeroPhrase,
  type LyricHeroSession,
  type LyricHeroUserGameState,
  type PuzzleBoard,
  type PublicPuzzleView,
  publicHint,
} from "./types"

export type {
  LyricHeroConfig,
  LyricHeroMode,
  LyricHeroUserGameState,
  PublicPuzzleView,
} from "./types"
export {
  defaultLyricHeroConfig,
  lyricHeroConfigSchema,
  LYRIC_HERO_PLUGIN_NAME,
} from "./types"
export { parseSingleGuess, normalizeWord, tokenizePhrase, blankDisplay } from "./matching"
export { moodLabelForMisses, crowdMoodLine, crowdMoodFeedback } from "./crowdMood"
export { createBoard, applyGuess, toPublicPuzzleView } from "./board"

const SESSION_KEY = "session"
const LEADERBOARD_KEY = "leaderboard"
/** HASH userId -> JSON PuzzleBoard (solo modes). */
const BOARDS_KEY = "boards"
/** HASH "winner" -> userId for competitive first-solve claim. */
const WINNER_KEY = "winner"
const AUTO_ADVANCE_TIMER = "lyric-hero-auto-advance"

type ActionResult = { success: boolean; message?: string }

function notInitialized(): ActionResult {
  return { success: false, message: "Plugin not initialized" }
}

export class LyricHeroPlugin extends BasePlugin<LyricHeroConfig> {
  name = LYRIC_HERO_PLUGIN_NAME
  version = packageJson.version
  description =
    "Lyric Hero — complete a lyric by guessing words. Crowd meter, three participation modes."

  static readonly configSchema = lyricHeroConfigSchema as any
  static readonly defaultConfig = defaultLyricHeroConfig

  getConfigSchema(): PluginConfigSchema {
    return getConfigSchema()
  }

  getComponentSchema(): PluginComponentSchema {
    return getComponentSchema()
  }

  async getComponentState(): Promise<LyricHeroComponentState> {
    return this.publicState()
  }

  async register(context: PluginContext): Promise<void> {
    await super.register(context)
    this.onConfigChange(async (data) => {
      const config = await this.getConfig()
      await this.maybeSelfStart(config, data.previousConfig)
    })
  }

  async contributeToUserGameState(
    userId: string,
    _ctx: ContributeToUserGameStateContext,
  ): Promise<LyricHeroUserGameState | null> {
    if (!this.context) return null
    const session = await this.loadSession()
    if (!session || session.mode === "cooperative") {
      return {
        puzzle: null,
        phraseIndex: null,
        phraseTotal: 0,
        acceptingGuesses: false,
        mode: session?.mode ?? null,
      }
    }

    const phrases = await this.loadPhrases()
    const board = await this.ensureUserBoard(userId, session, phrases)
    const phrase = phrases[session.activePhraseIndex]
    const reveal =
      board.walkedOut ||
      (session.mode === "competitive" && !session.acceptingGuesses && session.competitiveWinnerUserId)
        ? phrase?.text
        : undefined

    return {
      puzzle: toPublicPuzzleView(board, this.puzzleViewOpts(phrase, reveal)),
      phraseIndex: session.activePhraseIndex,
      phraseTotal: phrases.length,
      acceptingGuesses:
        session.acceptingGuesses && !board.solved && !board.walkedOut && !session.competitiveWinnerUserId,
      mode: session.mode,
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
      case "advancePhrase":
        return this.advancePhrase(initiator)
      case "endSession":
        return this.endSession(initiator)
      case "submitGuess":
        return this.submitGuess(initiator, params)
      default:
        return super.executeAction(action, initiator, params)
    }
  }

  protected parseConfigImportRows(action: string, rawText: string) {
    if (action !== "importPhrases") {
      return { ok: false as const, message: `No config import parser for action: ${action}` }
    }
    const rows = parseLyricPhrasesImport(rawText)
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
        ? `Replaced with ${count} phrase${count === 1 ? "" : "s"}`
        : `Appended ${count} phrase${count === 1 ? "" : "s"}`
    return { ...result, message }
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  private async maybeSelfStart(
    config: LyricHeroConfig | null,
    previousConfig: Record<string, unknown> | undefined,
  ): Promise<void> {
    if (!this.context || !config?.enabled) return
    const wasEnabled = (previousConfig as { enabled?: unknown } | undefined)?.enabled === true
    if (wasEnabled) return
    if ((config.phrases ?? []).filter((p) => p.text.trim()).length === 0) return
    if (await this.loadSession()) return
    await this.startSessionFromConfig(config)
  }

  private async startSession(initiator?: PluginActionInitiator): Promise<ActionResult> {
    const admin = await this.requireRoomAdminForAction(initiator)
    if (!admin.ok) return admin.result
    if (!this.context) return notInitialized()

    const config = await this.getConfig()
    if (!config?.enabled) {
      return { success: false, message: "Lyric Hero is disabled." }
    }
    if (await this.loadSession()) {
      return {
        success: false,
        message: "A Lyric Hero session is already running. End it before starting a new one.",
      }
    }
    return this.startSessionFromConfig(config)
  }

  private async startSessionFromConfig(config: LyricHeroConfig): Promise<ActionResult> {
    if (!this.context) return notInitialized()

    const phrases = (config.phrases ?? []).filter((p) => p.text.trim())
    if (phrases.length === 0) {
      return {
        success: false,
        message: "No phrases authored. Add phrases in the plugin settings first.",
      }
    }

    await this.context.storage.del(LEADERBOARD_KEY)
    await this.context.storage.del(BOARDS_KEY)
    await this.context.storage.del(WINNER_KEY)

    const session: LyricHeroSession = {
      id: randomUUID(),
      mode: config.mode,
      activePhraseIndex: 0,
      missMax: config.missMax,
      solveReward: config.solveReward,
      guessBonus: config.guessBonus,
      startedAt: Date.now(),
      autoAdvance: config.autoAdvance,
      autoAdvanceDelayMs: Math.max(0, Math.round(config.autoAdvanceDelaySec * 1000)),
      autoAdvanceDeadline: null,
      acceptingGuesses: true,
      sharedBoard: config.mode === "cooperative" ? createBoard(phrases[0]!.text, config.missMax) : null,
      inclusiveSolvers: [],
    }
    this.clearTimer(AUTO_ADVANCE_TIMER)
    await this.saveSession(session)

    const modeLabel =
      config.mode === "cooperative"
        ? "Cooperative — one shared lyric"
        : config.mode === "competitive"
          ? "Competitive — first to finish wins"
          : "Inclusive — everyone can finish"

    await this.context.api.sendSystemMessage(
      this.context.roomId,
      `🎸 Lyric Hero started — ${phrases.length} phrase${phrases.length === 1 ? "" : "s"}. ${modeLabel}. Guess words on the card above chat!`,
    )

    const state = await this.publicStateFrom(session, phrases)
    await this.emit<LyricHeroEvents["SESSION_STARTED"]>("SESSION_STARTED", {
      roundActive: true,
      mode: session.mode,
      phraseIndex: 0,
      phraseTotal: phrases.length,
      acceptingGuesses: true,
      puzzle: state.puzzle,
      leaderboard: [],
      statusMessage: state.statusMessage,
      autoAdvanceDeadline: null,
    })

    return { success: true, message: `Lyric Hero started with ${phrases.length} phrases.` }
  }

  private async advancePhrase(initiator?: PluginActionInitiator): Promise<ActionResult> {
    const admin = await this.requireRoomAdminForAction(initiator)
    if (!admin.ok) return admin.result
    if (!this.context) return notInitialized()

    const session = await this.loadSession()
    if (!session) return { success: false, message: "No active Lyric Hero session." }

    return this.performAdvance(session, await this.loadPhrases())
  }

  /**
   * Advance/end without admin gating — shared by the admin action and the
   * auto-advance timer. Clears any pending auto-advance timer first.
   */
  private async performAdvance(
    session: LyricHeroSession,
    phrases: LyricHeroPhrase[],
  ): Promise<ActionResult> {
    if (!this.context) return notInitialized()
    this.clearTimer(AUTO_ADVANCE_TIMER)
    session.autoAdvanceDeadline = null

    if (session.activePhraseIndex >= phrases.length - 1) {
      return this.finishSession(session)
    }

    session.activePhraseIndex += 1
    session.acceptingGuesses = true
    session.competitiveWinnerUserId = undefined
    session.competitiveWinnerUsername = undefined
    session.inclusiveSolvers = []
    await this.context.storage.del(BOARDS_KEY)
    await this.context.storage.del(WINNER_KEY)

    const phrase = phrases[session.activePhraseIndex]!
    session.sharedBoard =
      session.mode === "cooperative" ? createBoard(phrase.text, session.missMax) : null
    await this.saveSession(session)

    const state = await this.publicStateFrom(session, phrases)
    await this.emit<LyricHeroEvents["PHRASE_ADVANCED"]>(
      "PHRASE_ADVANCED",
      {
        phraseIndex: session.activePhraseIndex,
        phraseTotal: phrases.length,
        acceptingGuesses: true,
        puzzle: state.puzzle,
        statusMessage: state.statusMessage,
        autoAdvanceDeadline: null,
      },
      { invalidatesUserState: session.mode !== "cooperative" },
    )

    return {
      success: true,
      message: `Advanced to phrase ${session.activePhraseIndex + 1}.`,
    }
  }

  /**
   * Auto-advance timer callback. Advances only if still on the phrase the timer
   * was scheduled for (guards against manual advance/end).
   */
  private async autoAdvance(fromPhraseIndex: number): Promise<void> {
    const session = await this.loadSession()
    if (!session || session.activePhraseIndex !== fromPhraseIndex) return
    await this.performAdvance(session, await this.loadPhrases())
  }

  /**
   * Start the auto-advance timer if enabled and not already counting down.
   * Mutates `session.autoAdvanceDeadline` when a new timer starts.
   */
  private beginAutoAdvance(session: LyricHeroSession): LyricHeroAutoAdvanceDeadline | null {
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
    const fromPhraseIndex = session.activePhraseIndex
    this.startTimer(AUTO_ADVANCE_TIMER, {
      duration: session.autoAdvanceDelayMs,
      callback: () => this.autoAdvance(fromPhraseIndex),
    })
    return session.autoAdvanceDeadline
  }

  private activeAutoAdvanceDeadline(
    session: LyricHeroSession,
  ): LyricHeroAutoAdvanceDeadline | null {
    const deadline = session.autoAdvanceDeadline
    if (!deadline || deadline.endAt <= Date.now()) return null
    return deadline
  }

  private async endSession(initiator?: PluginActionInitiator): Promise<ActionResult> {
    const admin = await this.requireRoomAdminForAction(initiator)
    if (!admin.ok) return admin.result
    if (!this.context) return notInitialized()

    const session = await this.loadSession()
    if (!session) return { success: false, message: "No active Lyric Hero session." }
    return this.finishSession(session)
  }

  private async finishSession(session: LyricHeroSession): Promise<ActionResult> {
    if (!this.context) return notInitialized()

    this.clearTimer(AUTO_ADVANCE_TIMER)
    session.autoAdvanceDeadline = null

    const leaderboard = await this.buildLeaderboard()
    await this.context.api.sendSystemMessage(
      this.context.roomId,
      leaderboard.length > 0
        ? `🎸 Lyric Hero ended.\n${leaderboard
            .slice(0, 10)
            .map((e, i) => `${i + 1}. ${e.username} — ${e.score}`)
            .join("\n")}`
        : "🎸 Lyric Hero ended.",
    )
    await this.clearSession()

    const phrases = await this.loadPhrases()
    await this.emit<LyricHeroEvents["SESSION_ENDED"]>(
      "SESSION_ENDED",
      {
        roundActive: false,
        mode: null,
        phraseIndex: null,
        phraseTotal: phrases.length,
        acceptingGuesses: false,
        puzzle: null,
        leaderboard,
        statusMessage: null,
        autoAdvanceDeadline: null,
      },
      { invalidatesUserState: true },
    )

    return { success: true, message: "Lyric Hero ended." }
  }

  // ==========================================================================
  // Guesses
  // ==========================================================================

  private async submitGuess(
    initiator?: PluginActionInitiator,
    params?: Record<string, unknown>,
  ): Promise<ActionResult> {
    if (!this.context) return notInitialized()

    const userId = initiator?.userId?.trim()
    if (!userId) {
      return { success: false, message: "You must be logged in to guess." }
    }
    const username = initiator?.username?.trim() || userId

    const config = await this.getConfig()
    if (!config?.enabled) {
      return { success: false, message: "Lyric Hero is disabled." }
    }

    const rawWord = typeof params?.word === "string" ? params.word : ""
    if (rawWord.trim() && rawWord.trim().split(/\s+/).filter(Boolean).length > 1) {
      await this.context.api.sendUserSystemMessage(
        this.context.roomId,
        userId,
        "One word at a time — guess a single word.",
      )
      return { success: false, message: "Guess one word at a time." }
    }

    const normalized = parseSingleGuess(rawWord)
    if (!normalized) {
      return { success: false, message: "Enter a word to guess." }
    }

    const session = await this.loadSession()
    if (!session || !session.acceptingGuesses) {
      return { success: false, message: "No puzzle is accepting guesses right now." }
    }

    if (session.mode === "cooperative") {
      return this.submitCooperativeGuess(session, userId, username, normalized)
    }
    return this.submitSoloGuess(session, userId, username, normalized)
  }

  /**
   * Post crowd-mood chat + SFX. Cooperative = room-wide; solo = guesser only
   * (ADR 0072) so other players aren't tipped off by shared audio.
   */
  private async announceCrowdMood(
    params: {
      kind: CrowdMoodKind
      username: string
      missesUsed: number
      missMax: number
      solved?: boolean
    },
    delivery: { roomWide: true } | { userId: string },
  ): Promise<void> {
    if (!this.context) return
    const { line, soundUrl } = crowdMoodFeedback(params)
    if ("roomWide" in delivery) {
      await this.context.api.sendSystemMessage(this.context.roomId, line)
    } else {
      await this.context.api.sendUserSystemMessage(this.context.roomId, delivery.userId, line)
    }

    const config = await this.getConfig()
    if (config?.playSoundEffects === false) return

    if ("roomWide" in delivery) {
      await this.context.api.queueSoundEffect({ url: soundUrl, volume: 0.75, duck: true })
      return
    }
    await this.context.api.queueSoundEffect({
      url: soundUrl,
      volume: 0.75,
      userId: delivery.userId,
      duck: true,
    })
  }

  private async submitCooperativeGuess(
    session: LyricHeroSession,
    userId: string,
    username: string,
    normalized: string,
  ): Promise<ActionResult> {
    if (!this.context || !session.sharedBoard) {
      return { success: false, message: "No shared puzzle." }
    }

    const board = session.sharedBoard
    const result = applyGuess(board, normalized, userId, username)
    const phrases = await this.loadPhrases()
    const phraseText = phrases[session.activePhraseIndex]?.text ?? ""

    if (result.kind === "duplicate-hit" || result.kind === "duplicate-miss") {
      await this.context.api.sendUserSystemMessage(
        this.context.roomId,
        userId,
        result.kind === "duplicate-hit"
          ? "That word is already on the board."
          : "That word was already tried.",
      )
      return { success: false, message: "Already guessed." }
    }

    if (result.kind === "hit") {
      await this.announceCrowdMood(
        {
          kind: "hit",
          username,
          missesUsed: board.missedWords.length,
          missMax: board.missMax,
          solved: result.solved,
        },
        { roomWide: true },
      )

      if (result.solved) {
        session.acceptingGuesses = false
        const autoAdvanceDeadline = this.beginAutoAdvance(session)
        await this.saveSession(session)
        await this.paySolve(session, board, /* allOnline */ true)
        await this.context.api.sendSystemMessage(
          this.context.roomId,
          `🎉 The room completed the lyric: “${phraseText}”`,
        )
        await this.emitPuzzleUpdated(session, board, phrases, phraseText, autoAdvanceDeadline)
        return { success: true, message: "Solved!" }
      }

      await this.saveSession(session)
      await this.emitPuzzleUpdated(session, board, phrases)
      return { success: true, message: "Hit!" }
    }

    // miss
    const walkedOut = result.walkedOut
    await this.announceCrowdMood(
      {
        kind: walkedOut ? "walkout" : "miss",
        username,
        missesUsed: board.missedWords.length,
        missMax: board.missMax,
      },
      { roomWide: true },
    )

    if (walkedOut) {
      session.acceptingGuesses = false
      const autoAdvanceDeadline = this.beginAutoAdvance(session)
      await this.saveSession(session)
      await this.context.api.sendSystemMessage(
        this.context.roomId,
        `The lyric was: “${phraseText}”`,
      )
      await this.emitPuzzleUpdated(session, board, phrases, phraseText, autoAdvanceDeadline)
      return { success: true, message: "The crowd walked out." }
    }

    await this.saveSession(session)
    await this.emitPuzzleUpdated(session, board, phrases)
    return { success: true, message: "Miss." }
  }

  private async submitSoloGuess(
    session: LyricHeroSession,
    userId: string,
    username: string,
    normalized: string,
  ): Promise<ActionResult> {
    if (!this.context) return notInitialized()

    if (session.mode === "competitive" && session.competitiveWinnerUserId) {
      return { success: false, message: "Someone already finished this lyric." }
    }

    const phrases = await this.loadPhrases()
    const board = await this.ensureUserBoard(userId, session, phrases)

    if (board.solved || board.walkedOut) {
      return {
        success: false,
        message: board.solved ? "You already finished this lyric." : "Your crowd walked out.",
      }
    }

    const result = applyGuess(board, normalized, userId, username)

    if (result.kind === "duplicate-hit" || result.kind === "duplicate-miss") {
      await this.context.api.sendUserSystemMessage(
        this.context.roomId,
        userId,
        result.kind === "duplicate-hit"
          ? "That word is already on your board."
          : "You already tried that word.",
      )
      return { success: false, message: "Already guessed." }
    }

    await this.saveUserBoard(userId, board)

    const phraseText = phrases[session.activePhraseIndex]?.text ?? ""
    const moodKind: CrowdMoodKind =
      result.kind === "hit" ? "hit" : result.walkedOut ? "walkout" : "miss"
    await this.announceCrowdMood(
      {
        kind: moodKind,
        username,
        missesUsed: board.missedWords.length,
        missMax: board.missMax,
        solved: result.kind === "hit" && result.solved,
      },
      { userId },
    )

    if (result.kind === "hit" && result.solved) {
      if (session.mode === "competitive") {
        const claimed = await this.context.storage.hsetnx(WINNER_KEY, "winner", userId)
        if (!claimed) {
          // Lost the race — still paid nothing exclusive
          await this.pushMyPuzzle(userId, session, board, phrases)
          return { success: false, message: "Someone finished first." }
        }
        session.competitiveWinnerUserId = userId
        session.competitiveWinnerUsername = username
        session.acceptingGuesses = false
        const autoAdvanceDeadline = this.beginAutoAdvance(session)
        await this.saveSession(session)
        await this.paySolve(session, board, /* allOnline */ false, userId)
        await this.context.api.sendSystemMessage(
          this.context.roomId,
          `🏆 ${username} takes it! The lyric was: “${phraseText}”`,
        )
        await this.emit<LyricHeroEvents["PUZZLE_UPDATED"]>(
          "PUZZLE_UPDATED",
          {
            puzzle: toPublicPuzzleView(
              board,
              this.puzzleViewOpts(phrases[session.activePhraseIndex], phraseText),
            ),
            acceptingGuesses: false,
            statusMessage: `${username} finished first`,
            autoAdvanceDeadline,
          },
          { invalidatesUserState: true },
        )
        await this.pushMyPuzzle(userId, session, board, phrases, phraseText)
        const leaderboard = await this.buildLeaderboard(HOT_LEADERBOARD_TOP_N)
        await this.emit<LyricHeroEvents["LEADERBOARD_UPDATED"]>("LEADERBOARD_UPDATED", {
          leaderboard,
        })
        return { success: true, message: "You win!" }
      }

      // Inclusive — first solver starts auto-advance (quiz first-correct pattern).
      const wasEmpty = session.inclusiveSolvers.length === 0
      if (!session.inclusiveSolvers.includes(userId)) {
        session.inclusiveSolvers.push(userId)
      }
      const autoAdvanceDeadline = wasEmpty ? this.beginAutoAdvance(session) : null
      await this.saveSession(session)
      await this.paySolve(session, board, false, userId)
      await this.context.api.sendSystemMessage(
        this.context.roomId,
        `🎉 ${username} finished the lyric!`,
      )
      if (autoAdvanceDeadline) {
        await this.emit<LyricHeroEvents["PUZZLE_UPDATED"]>("PUZZLE_UPDATED", {
          acceptingGuesses: session.acceptingGuesses,
          statusMessage: this.statusFor(session, null),
          autoAdvanceDeadline,
        })
      }
      await this.pushMyPuzzle(userId, session, board, phrases)
      const leaderboard = await this.buildLeaderboard(HOT_LEADERBOARD_TOP_N)
      await this.emit<LyricHeroEvents["LEADERBOARD_UPDATED"]>("LEADERBOARD_UPDATED", {
        leaderboard,
      })
      return { success: true, message: "Solved!" }
    }

    if (result.kind === "miss" && result.walkedOut) {
      await this.pushMyPuzzle(userId, session, board, phrases, phraseText)
      return { success: true, message: "Your crowd walked out." }
    }

    await this.pushMyPuzzle(userId, session, board, phrases)
    return { success: true, message: result.kind === "hit" ? "Hit!" : "Miss." }
  }

  private async paySolve(
    session: LyricHeroSession,
    board: PuzzleBoard,
    allOnline: boolean,
    onlyUserId?: string,
  ): Promise<void> {
    if (!this.context) return

    const recipients: string[] = []
    if (allOnline) {
      const online = await this.context.api.getOnlineUserIds(this.context.roomId)
      recipients.push(...online)
    } else if (onlyUserId) {
      recipients.push(onlyUserId)
    }

    const solve = session.solveReward
    const bonus = session.guessBonus

    for (const uid of recipients) {
      let total = 0
      if (solve > 0) {
        await this.context.game.addScore(uid, "coin", solve, this.name)
        await this.context.game.addScore(uid, "score", solve, this.name)
        total += solve
      }
      const filledWords = board.fillers[uid] ?? []
      if (bonus > 0 && filledWords.length > 0) {
        const extra = bonus * filledWords.length
        await this.context.game.addScore(uid, "coin", extra, this.name)
        await this.context.game.addScore(uid, "score", extra, this.name)
        total += extra
      }
      if (total > 0) {
        await this.context.storage.zincrby(LEADERBOARD_KEY, total, uid)
      }
    }
  }

  private puzzleViewOpts(
    phrase: LyricHeroPhrase | undefined,
    revealedPhrase?: string,
  ): { revealedPhrase?: string; hint?: string } | undefined {
    const hint = publicHint(phrase)
    if (!revealedPhrase && !hint) return undefined
    return {
      ...(revealedPhrase ? { revealedPhrase } : {}),
      ...(hint ? { hint } : {}),
    }
  }

  private async emitPuzzleUpdated(
    session: LyricHeroSession,
    board: PuzzleBoard,
    phrases: LyricHeroPhrase[],
    revealedPhrase?: string,
    autoAdvanceDeadline?: LyricHeroAutoAdvanceDeadline | null,
  ): Promise<void> {
    await this.emit<LyricHeroEvents["PUZZLE_UPDATED"]>(
      "PUZZLE_UPDATED",
      {
        puzzle: toPublicPuzzleView(
          board,
          this.puzzleViewOpts(phrases[session.activePhraseIndex], revealedPhrase),
        ),
        acceptingGuesses: session.acceptingGuesses,
        statusMessage: this.statusFor(session, board),
        autoAdvanceDeadline:
          autoAdvanceDeadline !== undefined
            ? autoAdvanceDeadline
            : this.activeAutoAdvanceDeadline(session),
      },
      { invalidatesUserState: false },
    )
  }

  private async pushMyPuzzle(
    userId: string,
    session: LyricHeroSession,
    board: PuzzleBoard,
    phrases: LyricHeroPhrase[],
    revealedPhrase?: string,
  ): Promise<void> {
    if (!this.context) return
    await this.context.api.emitToUser(userId, "MY_PUZZLE", {
      puzzle: toPublicPuzzleView(
        board,
        this.puzzleViewOpts(phrases[session.activePhraseIndex], revealedPhrase),
      ),
      acceptingGuesses:
        session.acceptingGuesses &&
        !board.solved &&
        !board.walkedOut &&
        !session.competitiveWinnerUserId,
      phraseIndex: session.activePhraseIndex,
      phraseTotal: phrases.length,
      mode: session.mode,
    } satisfies LyricHeroEvents["MY_PUZZLE"])
  }

  // ==========================================================================
  // Boards / storage
  // ==========================================================================

  private async ensureUserBoard(
    userId: string,
    session: LyricHeroSession,
    phrases: LyricHeroPhrase[],
  ): Promise<PuzzleBoard> {
    const existing = await this.loadUserBoard(userId)
    if (existing) return existing
    const phrase = phrases[session.activePhraseIndex]
    const board = createBoard(phrase?.text ?? "", session.missMax)
    await this.saveUserBoard(userId, board)
    return board
  }

  private async loadUserBoard(userId: string): Promise<PuzzleBoard | null> {
    if (!this.context) return null
    const raw = await this.context.storage.hget(BOARDS_KEY, userId)
    if (!raw) return null
    try {
      return JSON.parse(raw) as PuzzleBoard
    } catch {
      return null
    }
  }

  private async saveUserBoard(userId: string, board: PuzzleBoard): Promise<void> {
    if (!this.context) return
    await this.context.storage.hset(BOARDS_KEY, userId, JSON.stringify(board))
  }

  private async loadSession(): Promise<LyricHeroSession | null> {
    if (!this.context) return null
    const raw = await this.context.storage.get(SESSION_KEY)
    if (!raw) return null
    try {
      const session = JSON.parse(raw) as LyricHeroSession
      // Backfill fields added after early session writes.
      if (typeof session.autoAdvance !== "boolean") session.autoAdvance = false
      if (typeof session.autoAdvanceDelayMs !== "number") session.autoAdvanceDelayMs = 0
      if (session.autoAdvanceDeadline === undefined) session.autoAdvanceDeadline = null
      return session
    } catch {
      return null
    }
  }

  private async saveSession(session: LyricHeroSession): Promise<void> {
    if (!this.context) return
    await this.context.storage.set(SESSION_KEY, JSON.stringify(session))
  }

  private async clearSession(): Promise<void> {
    if (!this.context) return
    this.clearTimer(AUTO_ADVANCE_TIMER)
    await this.context.storage.del(SESSION_KEY)
    await this.context.storage.del(LEADERBOARD_KEY)
    await this.context.storage.del(BOARDS_KEY)
    await this.context.storage.del(WINNER_KEY)
  }

  private async loadPhrases(): Promise<LyricHeroPhrase[]> {
    const config = await this.getConfig()
    return (config?.phrases ?? []).filter((p) => p.text.trim())
  }

  private async publicState(): Promise<LyricHeroComponentState> {
    const session = await this.loadSession()
    const phrases = await this.loadPhrases()
    if (!session) {
      return {
        roundActive: false,
        mode: null,
        phraseIndex: null,
        phraseTotal: phrases.length,
        acceptingGuesses: false,
        puzzle: null,
        leaderboard: await this.buildLeaderboard(),
        statusMessage: null,
        autoAdvanceDeadline: null,
      }
    }
    return this.publicStateFrom(session, phrases)
  }

  private async publicStateFrom(
    session: LyricHeroSession,
    phrases: LyricHeroPhrase[],
  ): Promise<LyricHeroComponentState> {
    let puzzle: PublicPuzzleView | null = null
    if (session.mode === "cooperative" && session.sharedBoard) {
      const phrase = phrases[session.activePhraseIndex]
      const reveal =
        !session.acceptingGuesses && (session.sharedBoard.walkedOut || session.sharedBoard.solved)
          ? phrase?.text
          : undefined
      puzzle = toPublicPuzzleView(session.sharedBoard, this.puzzleViewOpts(phrase, reveal))
    }

    return {
      roundActive: true,
      mode: session.mode,
      phraseIndex: session.activePhraseIndex,
      phraseTotal: phrases.length,
      acceptingGuesses: session.acceptingGuesses,
      puzzle,
      leaderboard: await this.buildLeaderboard(),
      statusMessage: this.statusFor(session, session.sharedBoard),
      autoAdvanceDeadline: this.activeAutoAdvanceDeadline(session),
    }
  }

  private statusFor(session: LyricHeroSession, board: PuzzleBoard | null): string {
    const n = (session.activePhraseIndex ?? 0) + 1
    if (session.competitiveWinnerUsername) {
      return `${session.competitiveWinnerUsername} finished phrase ${n}`
    }
    if (board?.walkedOut) return `Crowd walked out on phrase ${n}`
    if (board?.solved) return `Phrase ${n} complete`
    if (!session.acceptingGuesses) return `Phrase ${n} closed`
    return `Phrase ${n} — guess a word`
  }

  private async buildLeaderboard(topN?: number): Promise<LyricHeroLeaderboardEntry[]> {
    if (!this.context) return []
    const sorted =
      topN != null && topN > 0
        ? await fetchTopZsetEntries(this.context.storage, LEADERBOARD_KEY, topN)
        : [...(await this.context.storage.zrangeWithScores(LEADERBOARD_KEY, 0, -1))].sort(
            (a, b) => b.score - a.score,
          )
    const users = await this.context.api.getUsersByIds(sorted.map((e) => e.value))
    const nameById = new Map(users.map((u) => [u.userId, u.username]))
    return sorted.map((entry) => ({
      score: entry.score,
      value: entry.value,
      username: nameById.get(entry.value) ?? entry.value,
    }))
  }
}

export function createLyricHeroPlugin(configOverrides?: Partial<LyricHeroConfig>): Plugin {
  return new LyricHeroPlugin(configOverrides)
}

export default createLyricHeroPlugin
