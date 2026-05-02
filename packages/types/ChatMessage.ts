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
// Text effects & segments (plugin-driven rich chat; client maps to styles)
// =============================================================================

export const textEffectSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("size"), value: z.enum(["small", "normal", "large"]) }),
])
export type TextEffect = z.infer<typeof textEffectSchema>

export const textSegmentSchema = z.object({
  text: z.string(),
  effects: z.array(textEffectSchema).optional(),
})
export type TextSegment = z.infer<typeof textSegmentSchema>

// =============================================================================
// ChatMessage Schema & Type
// =============================================================================

export const chatMessageSchema = z.object({
  content: z.string(),
  /** When set, the client prefers this for rendering; `content` remains the canonical string. */
  contentSegments: z.array(textSegmentSchema).optional(),
  timestamp: z.string(),
  user: userSchema,
  mentions: z.array(z.string()).optional(),
  reactions: z.array(reactionSchema).optional(),
  meta: chatMessageMetaSchema.optional(),
})

export type ChatMessage = z.infer<typeof chatMessageSchema>
