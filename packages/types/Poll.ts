import { z } from "zod"

// =============================================================================
// Poll option limits
// =============================================================================

export const POLL_OPTION_LIMITS = { min: 2 } as const

// =============================================================================
// PollOption
// =============================================================================

export const pollOptionSchema = z.object({
  id: z.string(),
  label: z.string().min(1).max(120),
})

export type PollOption = z.infer<typeof pollOptionSchema>

// =============================================================================
// Poll status & settings
// =============================================================================

export const pollStatusSchema = z.enum(["open", "closed"])

export type PollStatus = z.infer<typeof pollStatusSchema>

export const pollSettingsSchema = z.object({
  hideRunningTotal: z.boolean().default(false),
})

export type PollSettings = z.infer<typeof pollSettingsSchema>

// =============================================================================
// Poll
// =============================================================================

export const pollSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  question: z.string().min(1).max(280),
  options: z.array(pollOptionSchema).min(POLL_OPTION_LIMITS.min),
  status: pollStatusSchema,
  settings: pollSettingsSchema,
  createdAt: z.number(),
  createdBy: z.string(),
  publishedAt: z.number(),
  closedAt: z.number().nullable(),
  closesAt: z.number().nullable(),
})

export type Poll = z.infer<typeof pollSchema>

// =============================================================================
// PollResults (immutable snapshot written on close)
// =============================================================================

export const pollResultsSchema = z.object({
  pollId: z.string(),
  totalVotes: z.number(),
  optionTallies: z.record(z.string(), z.number()),
  winners: z.array(z.string()),
  closedAt: z.number(),
})

export type PollResults = z.infer<typeof pollResultsSchema>

// =============================================================================
// MyPollVote (per-user vote state)
// =============================================================================

export const myPollVoteSchema = z.object({
  pollId: z.string(),
  optionId: z.string(),
  votedAt: z.number(),
})

export type MyPollVote = z.infer<typeof myPollVoteSchema>

// =============================================================================
// Poll history entry (closed poll + results)
// =============================================================================

export const pollHistoryEntrySchema = z.object({
  poll: pollSchema,
  results: pollResultsSchema,
})

export type PollHistoryEntry = z.infer<typeof pollHistoryEntrySchema>
