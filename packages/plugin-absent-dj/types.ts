import { z } from "zod"

/**
 * Zod schema for Absent DJ plugin configuration
 */
export const absentDjConfigSchema = z.object({
  enabled: z.boolean(),
  skipDelay: z.number().min(5000).max(300000), // milliseconds (5s - 5min)
  skipRequiresQueue: z.boolean(), // only skip when queue has enough tracks
  skipRequiresQueueMin: z.number().min(0), // minimum queue length required to skip
  messageOnPlay: z.optional(z.string()), // Message when absent DJ's track starts
  messageOnSkip: z.optional(z.string()), // Message when track is skipped
  soundEffectOnSkip: z.boolean(),
  soundEffectOnSkipUrl: z.optional(z.url()),
})

/**
 * Configuration for the Absent DJ plugin
 */
export type AbsentDjConfig = z.infer<typeof absentDjConfigSchema>

/**
 * Default configuration values
 */
export const defaultAbsentDjConfig: AbsentDjConfig = {
  enabled: false,
  skipDelay: 30000, // 30 seconds
  skipRequiresQueue: false,
  skipRequiresQueueMin: 0,
  messageOnPlay: undefined,
  messageOnSkip: undefined,
  soundEffectOnSkip: false,
  soundEffectOnSkipUrl: undefined,
}
