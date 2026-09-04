import { z } from "zod"
import { participationModeSchema } from "@repo/game-logic"
import type { BingoCard, BingoCriterion } from "@repo/types"

export type { BingoCard, BingoCardCell, BingoCardStatus, BingoCriterion } from "@repo/types"

const bingoCriterionTypeSchema = z.enum([
  "releaseYearEq",
  "releaseYearBetween",
  "artistContains",
  "titleContains",
  "albumContains",
  "addedByContains",
  "durationGt",
  "durationLt",
])

/**
 * Flat criterion row for admin object-array authoring (plan: optional fields +
 * superRefine by type). Extra unused fields are stripped when normalizing for deal.
 */
export const bingoCriterionSchema = z
  .object({
    id: z.string().optional().default(""),
    type: bingoCriterionTypeSchema,
    year: z.number().int().optional(),
    startYear: z.number().int().optional(),
    endYear: z.number().int().optional(),
    value: z.string().optional().default(""),
    durationMs: z.number().int().min(0).optional().default(0),
  })
  .superRefine((row, ctx) => {
    switch (row.type) {
      case "releaseYearEq":
        if (row.year == null || !Number.isFinite(row.year)) {
          ctx.addIssue({ code: "custom", message: "year is required", path: ["year"] })
        }
        break
      case "releaseYearBetween":
        if (row.startYear == null || row.endYear == null) {
          ctx.addIssue({
            code: "custom",
            message: "startYear and endYear are required",
            path: ["startYear"],
          })
        }
        break
      case "artistContains":
      case "titleContains":
      case "albumContains":
      case "addedByContains":
        if (!row.value?.trim()) {
          ctx.addIssue({ code: "custom", message: "value is required", path: ["value"] })
        }
        break
      case "durationGt":
      case "durationLt":
        if (row.durationMs == null || row.durationMs <= 0) {
          ctx.addIssue({
            code: "custom",
            message: "durationMs must be positive",
            path: ["durationMs"],
          })
        }
        break
    }
  })

export type BingoConfigCriterion = z.infer<typeof bingoCriterionSchema>

/** Normalize a config row into a typed BingoCriterion for dealing/matching. */
export function normalizeConfigCriterion(row: BingoConfigCriterion): BingoCriterion {
  const id = row.id?.trim() || ""
  switch (row.type) {
    case "releaseYearEq":
      return { id, type: "releaseYearEq", year: row.year! }
    case "releaseYearBetween":
      return {
        id,
        type: "releaseYearBetween",
        startYear: row.startYear!,
        endYear: row.endYear!,
      }
    case "artistContains":
    case "titleContains":
    case "albumContains":
    case "addedByContains":
      return { id, type: row.type, value: row.value?.trim() ?? "" }
    case "durationGt":
    case "durationLt":
      return { id, type: row.type, durationMs: row.durationMs ?? 0 }
  }
}

export const bingoCategorySchema = z.enum(["releaseYear", "releaseDecade", "mixed"])
export type BingoCategory = z.infer<typeof bingoCategorySchema>

export const playlistBingoConfigSchema = z.object({
  enabled: z.boolean().default(false),
  mode: participationModeSchema,
  coinReward: z.number().int().min(0).default(10),
  /** Coins awarded per newly covered space (0 = off). */
  spaceCoverCoinReward: z.number().int().min(0).default(0),
  category: bingoCategorySchema.default("releaseYear"),
  yearStart: z.number().int().default(1960),
  yearEnd: z.number().int().default(1980),
  decadeStart: z.number().int().default(1930),
  decadeEnd: z.number().int().default(2010),
  /** Private Mixed criteria bank (ADR 0068). Never broadcast. */
  criteria: z.array(bingoCriterionSchema).default([]),
  winnerLabel: z.string().default("Bingo Winner"),
  winnerIcon: z.string().default("Trophy"),
  bingoMessageTemplate: z.string().default("{{username}} got BINGO! +{{coins}} coins"),
  soundEffectOnBingo: z.boolean().default(true),
  soundEffectOnBingoUrl: z
    .url()
    .optional()
    .default("https://ross-brown.s3.amazonaws.com/broadcast/correct.mp3"),
})

export type PlaylistBingoConfig = z.infer<typeof playlistBingoConfigSchema>

export const defaultPlaylistBingoConfig: PlaylistBingoConfig = {
  enabled: false,
  mode: "inclusive",
  coinReward: 10,
  spaceCoverCoinReward: 0,
  category: "releaseYear",
  yearStart: 1960,
  yearEnd: 1980,
  decadeStart: 1930,
  decadeEnd: 2010,
  criteria: [],
  winnerLabel: "Bingo Winner",
  winnerIcon: "Trophy",
  bingoMessageTemplate: "{{username}} got BINGO! +{{coins}} coins",
  soundEffectOnBingo: true,
  soundEffectOnBingoUrl: "https://ross-brown.s3.amazonaws.com/broadcast/correct.mp3",
}

export interface BingoRoundCategorySnapshot {
  yearStart?: number
  yearEnd?: number
  decadeStart?: number
  decadeEnd?: number
  criteria?: BingoCriterion[]
}

export interface BingoRound {
  active: boolean
  category: BingoCategory
  startedAt: number
  categorySnapshot: BingoRoundCategorySnapshot
}

export interface PlaylistBingoPublicState extends Record<string, unknown> {
  roundActive: boolean
  category: BingoCategory | null
  statusMessage: string | null
}

export type PlaylistBingoEvents = {
  ROUND_STARTED: PlaylistBingoPublicState
  ROUND_UPDATED: PlaylistBingoPublicState
  ROUND_ENDED: PlaylistBingoPublicState
  BINGO: { userId: string; username: string; mode: string } & Record<string, unknown>
  /** Room-broadcast; clients filter by `userId`. Drives unread Bingo tab attention. */
  CELLS_COVERED: {
    userId: string
    count: number
    labels: string[]
  } & Record<string, unknown>
}

export type PlaylistBingoComponentState = PlaylistBingoPublicState

/** Minimum fillable cells on a 5×5 card with free center. */
export const BINGO_FILLABLE_CELLS = 24
export const BINGO_GRID_SIZE = 5
export const BINGO_FREE_ROW = 2
export const BINGO_FREE_COL = 2
