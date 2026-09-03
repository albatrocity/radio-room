import { z } from "zod"
import type { QueueThemeUserGameState } from "@repo/types"

export const QUEUE_THEME_PLUGIN_NAME = "queue-theme" as const

export const QUEUE_THEME_STORAGE_KEYS = {
  ROUND: "round",
  BRIEFS: "briefs",
  STANDINGS: "standings",
} as const

export const queueThemeConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /** Coins/score paid to the track DJ: max(0, yes - no) * this rate. */
  coinPerNetVote: z.number().int().min(0).default(1),
  /** Coins awarded to each voter who correctly picks Decoy (inclusive). */
  accusationReward: z.number().int().min(0).default(1),
})

export type QueueThemeConfig = z.infer<typeof queueThemeConfigSchema>

export const defaultQueueThemeConfig: QueueThemeConfig = {
  enabled: false,
  coinPerNetVote: 1,
  accusationReward: 1,
}

export type BriefKind = "real" | "decoy"

export type QueueThemeRoundOptionIds = {
  yes: string
  no: string
  decoy?: string
}

export type QueueThemeRound = {
  active: boolean
  theme: string
  decoyTheme: string | null
  decoyUserIds: string[]
  startedBy: string
  startedAt: number
  /** Active theme poll id, if any. */
  pollId: string | null
  /** Canonical media key for the track under vote. */
  pollTrackKey: string | null
  /** addedBy userId for the track under vote (null when plugin-attributed / missing). */
  pollDjUserId: string | null
  optionIds: QueueThemeRoundOptionIds | null
}

/** Private per-user bag from `contributeToUserGameState` (theme text + decoy flag). */
export type QueueThemeUserBrief = QueueThemeUserGameState & { theme: string }

export type QueueThemeComponentState = {
  roundActive: boolean
  decoyMode: boolean
  standings: { score: number; value: string; username: string }[]
}

export type QueueThemeEvents = {
  ROUND_STARTED: QueueThemeComponentState
  ROUND_ENDED: QueueThemeComponentState
  STANDINGS_UPDATED: QueueThemeComponentState
  POLL_CYCLE: QueueThemeComponentState
}
