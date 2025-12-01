import { z } from "zod"

/**
 * Zod schema for Special Words plugin configuration
 */
export const specialWordsConfigSchema = z.object({
  enabled: z.boolean(),
  words: z.array(z.string()),
  messageTemplate: z.string().optional(),
  sendMessageOnDetection: z.boolean().optional().default(true),
  wordLabel: z.string().optional().default("word"),
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
  sendMessageOnDetection: true,
  wordLabel: "word",
  messageTemplate: `Special word detected: {{word}} by {{username}}. {{username}} has used {{userAllWordsCount}} special words and is ranked {{userRank}}. Total words used: {{totalWordsUsed}}. This word has been used {{thisWordCount}} times ({{userThisWordCount}} times by {{username}}) and is ranked {{thisWordRank}}.`,
}
