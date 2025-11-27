import { z } from "zod"

// =============================================================================
// ReactionSubject Schema & Type
// =============================================================================

export const reactionSubjectSchema = z.object({
  type: z.enum(["message", "track"]),
  id: z.string(),
})

export type ReactionSubject = z.infer<typeof reactionSubjectSchema>
