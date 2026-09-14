import { z } from "zod"
import type { PluginFieldMeta } from "@repo/types"

/** Lyric Hero modes — cooperative is plugin-local (ADR 0172), not in game-logic. */
export type LyricHeroMode = "competitive" | "inclusive" | "cooperative"

export const LYRIC_HERO_MODES = [
  "competitive",
  "inclusive",
  "cooperative",
] as const satisfies readonly LyricHeroMode[]

export const lyricHeroModeSchema = z.enum(LYRIC_HERO_MODES).default("cooperative")

export const lyricHeroModeFieldMeta = {
  type: "enum",
  label: "Participation mode",
  description:
    "Competitive: each listener has their own board; first to solve wins. Inclusive: each has their own board and can finish independently. Cooperative: one shared board and crowd meter.",
  enumLabels: {
    competitive: "Competitive (PvP)",
    inclusive: "Inclusive (PvG)",
    cooperative: "Cooperative (shared board)",
  },
} satisfies PluginFieldMeta

export const lyricHeroPhraseSchema = z.object({
  text: z.string().default(""),
})

export type LyricHeroPhrase = z.infer<typeof lyricHeroPhraseSchema>

export const lyricHeroConfigSchema = z.object({
  enabled: z.boolean().default(false),
  mode: lyricHeroModeSchema,
  /** Unique wrong words before the crowd walks out. */
  missMax: z.number().int().min(1).max(20).default(6),
  /** Coins for solving (coop: all online; competitive: winner only; inclusive: each solver). */
  solveReward: z.number().int().min(0).default(10),
  /** Extra coins per distinct word the user filled on a solve. */
  guessBonus: z.number().int().min(0).default(5),
  /** Play crowd-mood sound effects on hit/miss/walkout. */
  playSoundEffects: z.boolean().default(true),
  /** After a phrase completes, automatically advance (quiz-sessions pattern). */
  autoAdvance: z.boolean().default(false),
  autoAdvanceDelaySec: z.number().int().min(0).default(10),
  /** Private phrase bank (ADR 0068). */
  phrases: z.array(lyricHeroPhraseSchema).default([]),
})

export type LyricHeroConfig = z.infer<typeof lyricHeroConfigSchema>

export const defaultLyricHeroConfig: LyricHeroConfig = {
  enabled: false,
  mode: "cooperative",
  missMax: 6,
  solveReward: 10,
  guessBonus: 5,
  playSoundEffects: true,
  autoAdvance: false,
  autoAdvanceDelaySec: 10,
  phrases: [],
}

export const LYRIC_HERO_PLUGIN_NAME = "lyric-hero" as const

// ============================================================================
// Puzzle board
// ============================================================================

export interface PuzzleToken {
  /** Original whitespace-delimited surface (punctuation kept). */
  surface: string
  /** Normalized match key (empty if no word characters). */
  normalized: string
  revealed: boolean
  contributorUserId?: string
  contributorUsername?: string
}

export interface PuzzleBoard {
  tokens: PuzzleToken[]
  /** Unique normalized wrong guesses. */
  missedWords: string[]
  missMax: number
  walkedOut: boolean
  solved: boolean
  /** userId -> distinct normalized words they correctly revealed. */
  fillers: Record<string, string[]>
}

/** Broadcast-safe display token (no secret remaining words beyond blanks). */
export interface PublicPuzzleToken {
  /** Render string: underscores for hidden letters, revealed surface when filled. */
  display: string
  revealed: boolean
  contributorUsername?: string
}

export interface PublicPuzzleView {
  tokens: PublicPuzzleToken[]
  missedWords: string[]
  missesUsed: number
  missMax: number
  moodLabel: string
  walkedOut: boolean
  solved: boolean
  /** Revealed full phrase when the round is over (walk-out or competitive win). */
  revealedPhrase?: string
}

// ============================================================================
// Session
// ============================================================================

export interface LyricHeroSession {
  id: string
  mode: LyricHeroMode
  /** Index into the live config phrase bank. */
  activePhraseIndex: number
  missMax: number
  solveReward: number
  guessBonus: number
  startedAt: number
  autoAdvance: boolean
  autoAdvanceDelayMs: number
  /**
   * Active auto-advance countdown window (card ExpiryBar). Set when a phrase
   * completes and the timer starts; cleared on advance/end.
   */
  autoAdvanceDeadline: LyricHeroAutoAdvanceDeadline | null
  /**
   * Whether guesses are accepted on the active phrase.
   * False after coop walk-out / competitive win until advance.
   */
  acceptingGuesses: boolean
  /** Cooperative shared board (null in solo modes). */
  sharedBoard: PuzzleBoard | null
  /** Competitive exclusive winner userId, if any. */
  competitiveWinnerUserId?: string
  competitiveWinnerUsername?: string
  /** Inclusive solvers for the active phrase (userIds). */
  inclusiveSolvers: string[]
}

/** Epoch window for the auto-advance countdown (drives the card ExpiryBar). */
export interface LyricHeroAutoAdvanceDeadline {
  startAt: number
  endAt: number
}

export interface LyricHeroLeaderboardEntry {
  score: number
  value: string
  username: string
}

export interface LyricHeroComponentState extends Record<string, unknown> {
  roundActive: boolean
  mode: LyricHeroMode | null
  phraseIndex: number | null
  phraseTotal: number
  acceptingGuesses: boolean
  /** Cooperative shared puzzle; null in solo modes. */
  puzzle: PublicPuzzleView | null
  leaderboard: LyricHeroLeaderboardEntry[]
  statusMessage: string | null
  autoAdvanceDeadline: LyricHeroAutoAdvanceDeadline | null
}

/** Per-user bag (competitive / inclusive) via contributeToUserGameState. */
export interface LyricHeroUserGameState {
  puzzle: PublicPuzzleView | null
  phraseIndex: number | null
  phraseTotal: number
  acceptingGuesses: boolean
  mode: LyricHeroMode | null
}

export interface LyricHeroEvents {
  SESSION_STARTED: {
    roundActive: true
    mode: LyricHeroMode
    phraseIndex: number
    phraseTotal: number
    acceptingGuesses: boolean
    puzzle: PublicPuzzleView | null
    leaderboard: LyricHeroLeaderboardEntry[]
    statusMessage: string | null
    autoAdvanceDeadline: null
  }
  PHRASE_ADVANCED: {
    phraseIndex: number
    phraseTotal: number
    acceptingGuesses: boolean
    puzzle: PublicPuzzleView | null
    statusMessage: string | null
    autoAdvanceDeadline: null
  }
  PUZZLE_UPDATED: {
    /** Omit to leave the room store puzzle unchanged (e.g. inclusive deadline-only). */
    puzzle?: PublicPuzzleView | null
    acceptingGuesses: boolean
    statusMessage: string | null
    autoAdvanceDeadline?: LyricHeroAutoAdvanceDeadline | null
  }
  MY_PUZZLE: {
    puzzle: PublicPuzzleView
    acceptingGuesses: boolean
    phraseIndex: number
    phraseTotal: number
    mode: LyricHeroMode
  }
  LEADERBOARD_UPDATED: {
    leaderboard: LyricHeroLeaderboardEntry[]
  }
  SESSION_ENDED: {
    roundActive: false
    mode: null
    phraseIndex: null
    phraseTotal: number
    acceptingGuesses: false
    puzzle: null
    leaderboard: LyricHeroLeaderboardEntry[]
    statusMessage: null
    autoAdvanceDeadline: null
  }
}
