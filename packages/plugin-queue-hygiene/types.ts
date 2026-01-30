import { z } from "zod"

/**
 * Zod schema for Queue Hygiene plugin configuration
 */
export const queueHygieneConfigSchema = z.object({
  enabled: z.boolean(),

  // Consecutive track prevention
  preventConsecutive: z.boolean(), // primary check: prevent back-to-back tracks from same user

  // Rate limiting settings (fallback when consecutive would occur)
  rateLimitEnabled: z.boolean(),
  baseCooldownMs: z.number().min(0).max(600000), // 0-10 minutes base cooldown
  maxCooldownMs: z.number().min(0).max(600000), // maximum cooldown
  cooldownScalesWithDjs: z.boolean(), // scale cooldown based on DJ count
  cooldownScalesWithQueue: z.boolean(), // scale cooldown based on queue length

  // Exemptions
  exemptAdmins: z.boolean(), // admins bypass rate limiting
})

/**
 * Configuration for the Queue Hygiene plugin
 */
export type QueueHygieneConfig = z.infer<typeof queueHygieneConfigSchema>

/**
 * Default configuration values
 */
export const defaultQueueHygieneConfig: QueueHygieneConfig = {
  enabled: false,

  // Consecutive track prevention
  preventConsecutive: true,

  // Rate limiting defaults
  rateLimitEnabled: true,
  baseCooldownMs: 30000, // 30 seconds base cooldown
  maxCooldownMs: 180000, // 3 minutes max cooldown
  cooldownScalesWithDjs: true,
  cooldownScalesWithQueue: true,

  // Exemptions
  exemptAdmins: true,
}
