import { z } from "zod"

export const roundRobinModeSchema = z.enum(["sequential", "nonSequential"])
export type RoundRobinMode = z.infer<typeof roundRobinModeSchema>

export const roundRobinDjConfigSchema = z.object({
  enabled: z.boolean(),
  mode: roundRobinModeSchema,
  /** When true, start the next round automatically once every deputy has queued. */
  autoAdvanceRounds: z.boolean(),
  /**
   * Sequential only: out-of-turn deputies may select a track that is held until
   * their turn, then auto-enqueued.
   */
  deferOutOfTurnQueues: z.boolean(),
})

export type RoundRobinDjConfig = z.infer<typeof roundRobinDjConfigSchema>

export const defaultRoundRobinDjConfig: RoundRobinDjConfig = {
  enabled: false,
  mode: "sequential",
  autoAdvanceRounds: true,
  deferOutOfTurnQueues: false,
}

export type HeldQueueTrack = {
  trackId: string
  mediaSourceType: string
  username: string
  heldAt: number
}

export type RoundRobinPhase = "open" | "locked" | "roundComplete"

export interface RoundRobinState {
  mode: RoundRobinMode
  phase: RoundRobinPhase
  /** Turn order. Built during sequential discovery; fixed after lock. */
  order: string[]
  /** All participating deputies (roster). */
  participants: string[]
  queuedThisRound: string[]
  currentIndex: number
  adminForcedUserId: string | null
  round: number
  orderLocked: boolean
}

export const STATE_KEY = "state"
export const ROBIN_PERSONA_ID = "robin"
export const PLUGIN_NAME = "round-robin-dj"
