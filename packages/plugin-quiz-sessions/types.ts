import { z } from "zod"
import { participationModeSchema, type ParticipationMode } from "@repo/game-logic"

// ============================================================================
// Config
// ============================================================================

/**
 * A single authored question in the config-level question bank.
 *
 * The bank is a `private` `object-array` config field (ADR 0068): authored through
 * the normal schema form but stored in the server-only `:private` Redis key and
 * never broadcast. Runtime code reads it live via `getConfig()` (merged) on every
 * access — the session never copies it — so admin edits during a show take effect
 * immediately. Questions are addressed by their position (index) in the bank.
 */
export const quizConfigQuestionSchema = z.object({
  text: z.string().default(""),
  /** Exact (case-insensitive, trimmed) accepted answers. Secret — private field. */
  acceptedAnswers: z.array(z.string()).default([]),
})

export type QuizConfigQuestion = z.infer<typeof quizConfigQuestionSchema>

/**
 * Quiz settings + the (private) authored question bank. Only non-`private` fields
 * are broadcast; the `questions` field is `scope: "private"` in the config schema,
 * so accepted answers never reach guests (ADR 0068).
 */
export const quizSessionsConfigSchema = z.object({
  enabled: z.boolean().default(false),
  mode: participationModeSchema,
  autoAdvance: z.boolean().default(false),
  autoAdvanceDelaySec: z.number().int().min(0).default(10),
  coinReward: z.number().int().min(0).default(10),
  correctAnswerTemplate: z.string().default("{{username}} answered correctly! +{{coins}} coins"),
  soundEffectOnCorrect: z.boolean().default(true),
  soundEffectOnCorrectUrl: z
    .url()
    .optional()
    .default("https://ross-brown.s3.amazonaws.com/broadcast/correct.mp3"),
  /**
   * Winner persona label. When non-empty (and enabled), a persona is registered
   * and assigned on each correct answer. In PvP (competitive) mode it is
   * exclusive — the badge moves to the latest guesser. In PvG (inclusive) mode
   * it is non-exclusive — every correct guesser keeps the badge. Empty = disabled.
   */
  winnerLabel: z.string().default(""),
  /** Lucide icon name for the winner persona badge. */
  winnerIcon: z.string().default("Crown"),
  /** Private question bank (see `quizConfigQuestionSchema`). Never broadcast. */
  questions: z.array(quizConfigQuestionSchema).default([]),
})

export type QuizSessionsConfig = z.infer<typeof quizSessionsConfigSchema>

export const defaultQuizSessionsConfig: QuizSessionsConfig = {
  enabled: false,
  mode: "inclusive",
  autoAdvance: false,
  autoAdvanceDelaySec: 10,
  coinReward: 10,
  correctAnswerTemplate: "{{username}} answered correctly! +{{coins}} coins",
  soundEffectOnCorrect: true,
  soundEffectOnCorrectUrl: "https://ross-brown.s3.amazonaws.com/broadcast/correct.mp3",
  winnerLabel: "",
  winnerIcon: "Crown",
  questions: [],
}

// ============================================================================
// Server-side data model (plugin storage — never broadcast wholesale)
// ============================================================================

/**
 * Runtime state for a running quiz. The question bank itself is NOT copied here —
 * it is read live from the plugin's (private) config on every access, so admin
 * edits in the settings modal during a show take effect immediately (ADR 0068).
 * The session only tracks per-run progress and per-question runtime, keyed by the
 * question's position (index) in the live bank.
 */
export interface QuizSession {
  id: string
  /** -1 = not started; 0..N-1 = active question (index into the live config bank). */
  activeQuestionIndex: number
  mode: ParticipationMode
  autoAdvance: boolean
  autoAdvanceDelayMs: number
  coinReward: number
  /** Persona definition ids available for hot-potato assignment. */
  personaIds: string[]
  activePersonaIndex: number
  startedAt: number
  /** question index (as string) -> userIds who answered correctly. */
  winnersPerQuestion: Record<string, string[]>
  /** question index (as string) -> revealed answer (PvP correct guess). */
  revealedAnswers: Record<string, string>
}

// ============================================================================
// Public (broadcast-safe) shapes — accepted answers stripped
// ============================================================================

export interface PublicQuizQuestion {
  id: string
  text: string
  index: number
  total: number
  /** Present only when the answer is public (PvP correct guess or admin reveal). */
  revealedAnswer?: string
}

export interface QuizLeaderboardEntry {
  score: number
  /** userId */
  value: string
  username: string
}

export interface QuizSessionResults {
  leaderboard: QuizLeaderboardEntry[]
}

/**
 * Broadcast notice of the latest correct answer. Carries no answer text — it
 * only lets each client light up a private "You got it!" indicator when
 * `userId` matches the current user (PvG spoiler-safe).
 */
export interface QuizCorrectNotice {
  userId: string
  questionId: string
}

// ============================================================================
// Frontend plugin events (PLUGIN:quiz-sessions:*)
// ============================================================================

/**
 * All payloads carry the component store keys the frontend cares about
 * (`activeQuestion`, `leaderboard`, `lastCorrectAnswer`) so
 * `pluginComponentMachine` can update the card/leaderboard directly from events
 * (see `getComponentSchema().storeKeys`).
 */
export interface QuizSessionsEvents {
  SESSION_STARTED: {
    activeQuestion: PublicQuizQuestion | null
    leaderboard: QuizLeaderboardEntry[]
    /** Clears any stale "You got it!" state from a previous session. */
    lastCorrectAnswer: null
  }
  QUESTION_ADVANCED: {
    activeQuestion: PublicQuizQuestion
  }
  CORRECT_ANSWER: {
    userId: string
    username?: string
    questionId: string
    /** Revealed only in competitive (PvP) mode; omitted in inclusive (PvG). */
    answer?: string
    mode: ParticipationMode
    /** Updated question so the card reflects a PvP reveal (no reveal in PvG). */
    activeQuestion: PublicQuizQuestion | null
    /** Drives the per-user "You got it!" indicator. */
    lastCorrectAnswer: QuizCorrectNotice
  }
  LEADERBOARD_UPDATED: {
    leaderboard: QuizLeaderboardEntry[]
  }
  SESSION_ENDED: {
    results: QuizSessionResults
    /** Hides the question card. */
    activeQuestion: null
    /** Final standings for the game-state tab. */
    leaderboard: QuizLeaderboardEntry[]
    lastCorrectAnswer: null
  }
  PERSONA_ASSIGNED: {
    userId: string
    personaId: string
  }
}

export interface QuizSessionsComponentState extends Record<string, unknown> {
  activeQuestion: PublicQuizQuestion | null
  leaderboard: QuizLeaderboardEntry[]
  lastCorrectAnswer: QuizCorrectNotice | null
}
