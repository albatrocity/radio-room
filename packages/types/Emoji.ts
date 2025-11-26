import { z } from "zod"

// =============================================================================
// Emoji Schema & Type
// =============================================================================

export const emojiSchema = z.object({
  id: z.string(),
  name: z.string(),
  native: z.string().optional(),
  unified: z.string().optional(),
  keywords: z.array(z.string()),
  shortcodes: z.string(),
  skin: z.number().optional(),
  aliases: z.array(z.string()).optional(),
})

export type Emoji = z.infer<typeof emojiSchema>
