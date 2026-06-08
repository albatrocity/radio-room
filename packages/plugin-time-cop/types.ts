import { z } from "zod"

/**
 * Zod schema for Time Cop plugin configuration.
 *
 * The `superRefine` validation ensures that when enabled:
 * - endTime must be provided
 * - endTime must be at least 1 minute in the future
 */
export const timeCopConfigSchema = z
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
        message: "End time is required when Time Cop is enabled",
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
 * Configuration for the Time Cop plugin.
 */
export type TimeCopConfig = z.infer<typeof timeCopConfigSchema>

/**
 * Default configuration values.
 */
export const defaultTimeCopConfig: TimeCopConfig = {
  enabled: false,
  endTime: null,
  endTimeZone: null,
  minPlaybackMs: 30_000, // 30 seconds minimum playback
  warnOnOverrun: true,
}

/**
 * Runtime state for the Time Cop plugin.
 * Lives in plugin storage at key `state`. Independent of config.
 */
export type TimeCopState = {
  currentTrackId: string | null
  currentDeadline: number | null // epoch ms
  currentTrackSkipCanceled: boolean
  isPaused: boolean
  pausedRemainingMs: number | null
}

/**
 * Default runtime state.
 */
export const defaultTimeCopState: TimeCopState = {
  currentTrackId: null,
  currentDeadline: null,
  currentTrackSkipCanceled: false,
  isPaused: false,
  pausedRemainingMs: null,
}

/**
 * Grace period after endTime during which Time Cop is still considered active.
 * Allows the last track to complete even if it runs slightly over.
 */
const GRACE_PERIOD_MS = 60_000

/**
 * Helper to determine if Time Cop is active (enabled with a valid future endTime).
 * Uses a 60-second grace period after endTime to allow the last track to complete.
 */
export function isActive(config: TimeCopConfig | null): boolean {
  if (!config?.enabled) return false
  if (config.endTime == null) return false
  return Date.now() < config.endTime + GRACE_PERIOD_MS
}
