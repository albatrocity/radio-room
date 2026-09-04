import { z } from "zod"
import {
  COST_SCALE_MAX,
  COST_SCALE_MIN,
  DEFAULT_ECONOMY_POLICY,
} from "@repo/game-logic"

export const theFedModeSchema = z.enum(["observe", "adjust"])
export type TheFedMode = z.infer<typeof theFedModeSchema>

export const theFedWealthStatisticSchema = z.enum(["median", "mean", "trimmedMean"])

export const theFedTickReasonSchema = z.enum([
  "idle",
  "no_session",
  "min_participants",
  "zero_basket",
  "deadband",
  "observed",
  "adjusted",
])
export type TheFedTickReason = z.infer<typeof theFedTickReasonSchema>

export const theFedConfigSchema = z.object({
  enabled: z.boolean().default(false),
  mode: theFedModeSchema.default("observe"),
  tickSeconds: z.number().int().min(15).max(600).default(60),
  targetAffordability: z.number().min(0.5).max(20).default(3),
  wealthStatistic: theFedWealthStatisticSchema.default("median"),
  smoothing: z.number().min(0).max(1).default(DEFAULT_ECONOMY_POLICY.smoothing),
  deadband: z.number().min(0).max(1).default(DEFAULT_ECONOMY_POLICY.deadband),
  maxStepPct: z.number().min(0).max(1).default(DEFAULT_ECONOMY_POLICY.maxStepPct),
  minCostScale: z.number().min(COST_SCALE_MIN).max(COST_SCALE_MAX).default(COST_SCALE_MIN),
  maxCostScale: z.number().min(COST_SCALE_MIN).max(COST_SCALE_MAX).default(COST_SCALE_MAX),
  minParticipants: z.number().int().min(1).max(50).default(3),
  basketPriceOverride: z.number().min(0).optional(),
  announceChanges: z.boolean().default(false),
  /** Live mirrors of session metrics for Quick Access (ADR 0135). */
  costScale: z.number().default(1),
  earnScale: z.number().default(1),
  affordability: z.number().default(0),
  wealth: z.number().default(0),
  flowRatio: z.number().default(0),
  tickReason: theFedTickReasonSchema.default("idle"),
  participantCount: z.number().int().min(0).default(0),
})

export type TheFedConfig = z.infer<typeof theFedConfigSchema>

export const defaultTheFedConfig: TheFedConfig = {
  enabled: false,
  mode: "observe",
  tickSeconds: 60,
  targetAffordability: 3,
  wealthStatistic: "median",
  smoothing: DEFAULT_ECONOMY_POLICY.smoothing,
  deadband: DEFAULT_ECONOMY_POLICY.deadband,
  maxStepPct: DEFAULT_ECONOMY_POLICY.maxStepPct,
  minCostScale: COST_SCALE_MIN,
  maxCostScale: COST_SCALE_MAX,
  minParticipants: 3,
  announceChanges: false,
  costScale: 1,
  earnScale: 1,
  affordability: 0,
  wealth: 0,
  flowRatio: 0,
  tickReason: "idle",
  participantCount: 0,
}

export interface FedTickRecord {
  t: number
  wealth: number
  affordability: number
  costScale: number
  earnScale: number
  flowRatio: number
  acted: boolean
  reason: TheFedTickReason
  participantCount: number
}

export interface FedControllerState {
  emaWealth: number | null
  sessionId: string | null
}

export interface FedFlowState {
  netCoinFlow: number
  lastTickAt: number | null
  sessionId: string | null
}
