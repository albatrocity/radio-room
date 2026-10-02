import { z } from "zod"
import { presentationThemeSchema, presentationVariantSchema } from "./PresentationTheme"

// =============================================================================
// Poll option limits
// =============================================================================

export const POLL_OPTION_LIMITS = { min: 2 } as const

/** Bounds for timed poll auto-close (ADR 0189). */
export const POLL_CLOSE_DURATION_MS = {
  min: 5_000,
  max: 24 * 60 * 60_000,
} as const

export type PollCloseReason = "manual" | "expired"

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

/**
 * Themed look for a plugin-authored poll (ADR 0203). Only plugins can set it;
 * the admin poll handler never accepts it. Behavior is unchanged.
 */
export const pollPresentationSchema = z.object({
  theme: presentationThemeSchema,
  variant: presentationVariantSchema.optional(),
  /** Small label above the headline, e.g. "EXIT 41". */
  eyebrow: z.string().max(24).optional(),
  headline: z.string().max(80).optional(),
  icon: z.string().max(16).optional(),
  imageUrl: z.string().url().optional(),
  footnote: z.string().max(120).optional(),
})

export type PollPresentation = z.infer<typeof pollPresentationSchema>

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
  presentation: pollPresentationSchema.optional(),
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
