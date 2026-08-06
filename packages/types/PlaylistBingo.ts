/**
 * Playlist Bingo per-user card delivery (ADR 0096 / 0097).
 * Storage keys and public card shape shared by plugin and web;
 * cards reach the client via `contributeToUserGameState` → `pluginUserState`.
 */

export const PLAYLIST_BINGO_PLUGIN_NAME = "playlist-bingo" as const

/** Game-state modal tab id from the plugin component schema (`bingo-tab`). */
export const PLAYLIST_BINGO_TAB_ID = "bingo-tab" as const

export const PLAYLIST_BINGO_STORAGE_KEYS = {
  ROUND: "round",
  CARDS: "cards",
  WINNERS: "winners",
} as const

/** Criterion types that can appear on a dealt card (Mixed bank + year/decade synthesis). */
export type BingoCriterionType =
  | "releaseYearEq"
  | "releaseYearBetween"
  | "releaseDecadeEq"
  | "artistContains"
  | "titleContains"
  | "albumContains"
  | "addedByContains"
  | "durationGt"
  | "durationLt"
  | "free"

export type BingoCriterion =
  | { id: string; type: "releaseYearEq"; year: number }
  | { id: string; type: "releaseYearBetween"; startYear: number; endYear: number }
  | { id: string; type: "releaseDecadeEq"; decade: number }
  | { id: string; type: "artistContains"; value: string }
  | { id: string; type: "titleContains"; value: string }
  | { id: string; type: "albumContains"; value: string }
  | { id: string; type: "addedByContains"; value: string }
  | { id: string; type: "durationGt"; durationMs: number }
  | { id: string; type: "durationLt"; durationMs: number }
  | { id: string; type: "free" }

export interface BingoCardCell {
  r: number
  c: number
  criterionId: string
  label: string
  marked: boolean
  free?: boolean
  criterion: BingoCriterion
}

export type BingoCardStatus = "playing" | "won" | "locked"

export interface BingoCard {
  userId: string
  cells: BingoCardCell[]
  status: BingoCardStatus
  wonAt?: number
}
