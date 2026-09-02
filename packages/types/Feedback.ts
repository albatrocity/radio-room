import { z } from "zod"

// =============================================================================
// Limits
// =============================================================================

export const FEEDBACK_LIMITS = {
  titleMin: 1,
  titleMax: 80,
  descriptionMax: 280,
  commentMax: 2000,
  maxActiveTopics: 20,
} as const

/** Sentinel topic id — not stored in Redis topics hash; always last in UI. */
export const GENERAL_FEEDBACK_TOPIC_ID = "general" as const

// =============================================================================
// Topic
// =============================================================================

export const feedbackTopicStatusSchema = z.enum(["active", "archived"])
export type FeedbackTopicStatus = z.infer<typeof feedbackTopicStatusSchema>

export const feedbackTopicSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(FEEDBACK_LIMITS.titleMin).max(FEEDBACK_LIMITS.titleMax),
  description: z.string().max(FEEDBACK_LIMITS.descriptionMax).optional(),
  sortOrder: z.number().int().nonnegative(),
  status: feedbackTopicStatusSchema,
  createdAt: z.number(),
  updatedAt: z.number(),
})

export type FeedbackTopic = z.infer<typeof feedbackTopicSchema>

// =============================================================================
// Response
// =============================================================================

export const feedbackVoteSchema = z.enum(["up", "down"])
export type FeedbackVote = z.infer<typeof feedbackVoteSchema>

export const feedbackResponseSchema = z.object({
  topicId: z.string().min(1),
  userId: z.string().min(1),
  /** Null when General feedback is comment-only (no thumbs). Named topics always have a vote. */
  vote: feedbackVoteSchema.nullable(),
  comment: z.string().max(FEEDBACK_LIMITS.commentMax),
  updatedAt: z.number(),
})

export type FeedbackResponse = z.infer<typeof feedbackResponseSchema>

/** Stored value inside Redis responses HASH (no topicId/userId — those are keys). */
export const feedbackResponseStoredSchema = z.object({
  vote: feedbackVoteSchema.nullable(),
  comment: z.string().max(FEEDBACK_LIMITS.commentMax),
  updatedAt: z.number(),
})

export type FeedbackResponseStored = z.infer<typeof feedbackResponseStoredSchema>

// =============================================================================
// Inbox / export
// =============================================================================

export const feedbackInboxEntrySchema = z.object({
  topicId: z.string(),
  userId: z.string(),
  username: z.string(),
  vote: feedbackVoteSchema.nullable(),
  comment: z.string(),
  updatedAt: z.number(),
})

export type FeedbackInboxEntry = z.infer<typeof feedbackInboxEntrySchema>

export const feedbackExportResponseSchema = z.object({
  userId: z.string(),
  username: z.string(),
  vote: feedbackVoteSchema.nullable(),
  comment: z.string(),
  updatedAt: z.number(),
})

export type FeedbackExportResponse = z.infer<typeof feedbackExportResponseSchema>

export const feedbackExportTopicSchema = z.object({
  topic: feedbackTopicSchema,
  upCount: z.number(),
  downCount: z.number(),
  responses: z.array(feedbackExportResponseSchema),
})

export type FeedbackExportTopic = z.infer<typeof feedbackExportTopicSchema>

export const feedbackExportDataSchema = z.object({
  topics: z.array(feedbackExportTopicSchema),
})

export type FeedbackExportData = z.infer<typeof feedbackExportDataSchema>

/** Input for SET_FEEDBACK_TOPICS (full replace of active list). */
export const feedbackTopicInputSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(FEEDBACK_LIMITS.titleMin).max(FEEDBACK_LIMITS.titleMax),
  description: z.string().max(FEEDBACK_LIMITS.descriptionMax).optional(),
})

export type FeedbackTopicInput = z.infer<typeof feedbackTopicInputSchema>
