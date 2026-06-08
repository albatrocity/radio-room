import { z } from "zod"

/**
 * Zod schema for Queue Pacer plugin configuration.
 *
 * The `superRefine` validation ensures that when enabled:
 * - endTime must be provided
 * - endTime must be at least 1 minute in the future
 */
export const queuePacerConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    endTime: z.number().int().nullable().default(null), // epoch ms
    /** IANA timezone used when endTime was set (for display in system messages). */
    endTimeZone: z.string().nullable().default(null),
    minPlaybackMs: z.number().int().min(5_000).max(300_000).default(30_000),
    warnOnOverrun: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    if (!data.enabled) return
    if (data.endTime == null) {
      ctx.addIssue({
        path: ["endTime"],
        code: z.ZodIssueCode.custom,
        message: "End time is required when Queue Pacer is enabled",
      })
      return
    }
    if (data.endTime <= Date.now() + 60_000) {
      ctx.addIssue({
        path: ["endTime"],
        code: z.ZodIssueCode.custom,
        message: "End time must be at least 1 minute in the future",
      })
    }
  })

/**
 * Configuration for the Queue Pacer plugin.
 */
export type QueuePacerConfig = z.infer<typeof queuePacerConfigSchema>

/**
 * Default configuration values.
 */
export const defaultQueuePacerConfig: QueuePacerConfig = {
  enabled: false,
  endTime: null,
  endTimeZone: null,
  minPlaybackMs: 30_000, // 30 seconds minimum playback
  warnOnOverrun: true,
}

/**
 * Runtime state for the Queue Pacer plugin.
 * Lives in plugin storage at key `state`. Independent of config.
 */
export type QueuePacerState = {
  currentTrackId: string | null
  currentDeadline: number | null // epoch ms
  currentTrackSkipCanceled: boolean
  isPaused: boolean
  pausedRemainingMs: number | null
}

/**
 * Default runtime state.
 */
export const defaultQueuePacerState: QueuePacerState = {
  currentTrackId: null,
  currentDeadline: null,
  currentTrackSkipCanceled: false,
  isPaused: false,
  pausedRemainingMs: null,
}

/**
 * Grace period after endTime during which Queue Pacer is still considered active.
 * Allows the last track to complete even if it runs slightly over.
 */
const GRACE_PERIOD_MS = 60_000

/**
 * Helper to determine if Queue Pacer is active (enabled with a valid future endTime).
 * Uses a 60-second grace period after endTime to allow the last track to complete.
 */
export function isActive(config: QueuePacerConfig | null): boolean {
  if (!config?.enabled) return false
  if (config.endTime == null) return false
  return Date.now() < config.endTime + GRACE_PERIOD_MS
}
