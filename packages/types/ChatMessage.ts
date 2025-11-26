import { z } from "zod"
import { reactionSchema } from "./Reaction"
import { userSchema } from "./User"

// =============================================================================
// ChatMessage Meta Schema
// =============================================================================

export const chatMessageMetaSchema = z.object({
  status: z.enum(["error", "success", "warning", "info"]).optional(),
  type: z.enum(["alert"]).nullable().optional(),
  title: z.string().nullable().optional(),
})

// =============================================================================
// ChatMessage Schema & Type
// =============================================================================

export const chatMessageSchema = z.object({
  content: z.string(),
  timestamp: z.string(),
  user: userSchema,
  mentions: z.array(z.string()).optional(),
  reactions: z.array(reactionSchema).optional(),
  meta: chatMessageMetaSchema.optional(),
})

export type ChatMessage = z.infer<typeof chatMessageSchema>
