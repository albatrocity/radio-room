import { z } from "zod"
import {
  defaultSkipRequiresQueueConfig,
  skipRequiresQueueConfigSchema,
} from "@repo/plugin-base/helpers"

/**
 * Zod schema for Absent DJ plugin configuration
 */
export const absentDjConfigSchema = z
  .object({
    enabled: z.boolean(),
    skipDelay: z.number().min(5000).max(300000), // milliseconds (5s - 5min)
    messageOnPlay: z.optional(z.string()), // Message when absent DJ's track starts
    messageOnSkip: z.optional(z.string()), // Message when track is skipped
    soundEffectOnSkip: z.boolean(),
    soundEffectOnSkipUrl: z.optional(z.url()),
  })
  .merge(skipRequiresQueueConfigSchema)

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
  ...defaultSkipRequiresQueueConfig,
  messageOnPlay: undefined,
  messageOnSkip: undefined,
  soundEffectOnSkip: false,
  soundEffectOnSkipUrl: undefined,
}
