import { z } from "zod"
import { emojiSchema } from "./Emoji"
import { userSchema } from "./User"
import { reactionSubjectSchema } from "./ReactionSubject"

// =============================================================================
// Reaction Schema & Type
// =============================================================================

export const reactionSchema = z.object({
  emoji: z.string(),
  user: z.string(), // User["userId"]
})

export type Reaction = z.infer<typeof reactionSchema>

// =============================================================================
// ReactionPayload Schema & Type
// =============================================================================

export const reactionPayloadSchema = z.object({
  emoji: emojiSchema,
  reactTo: reactionSubjectSchema,
  user: userSchema,
})

export type ReactionPayload = z.infer<typeof reactionPayloadSchema>

// =============================================================================
// ReactionStore Schema & Type
// =============================================================================

export const reactionableTypeSchema = z.enum(["message", "track"])
export type ReactionableType = z.infer<typeof reactionableTypeSchema>

export const reactionStoreSchema = z.record(
  reactionableTypeSchema,
  z.record(z.string(), z.array(reactionSchema)),
)

export type ReactionStore = z.infer<typeof reactionStoreSchema>
