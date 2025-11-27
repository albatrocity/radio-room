import { z } from "zod"

/**
 * Zod schema for Special Words plugin configuration
 */
export const specialWordsConfigSchema = z.object({
  enabled: z.boolean(),
  words: z.array(z.string()),
})

/**
 * Configuration for the Special Words plugin
 */
export type SpecialWordsConfig = z.infer<typeof specialWordsConfigSchema>

/**
 * Default configuration values
 */
export const defaultSpecialWordsConfig: SpecialWordsConfig = {
  enabled: false,
  words: [],
}
