import { z } from "zod"
import { metadataSourceTrackSchema } from "./MetadataSource"
import { userSchema } from "./User"
import { mediaSourceInfoSchema, metadataSourceInfoSchema } from "./TrackSource"

// =============================================================================
// QueueItem Schema & Type
// =============================================================================

export const queueItemSchema = z.object({
  title: z.string(),
  track: metadataSourceTrackSchema,
  mediaSource: mediaSourceInfoSchema, // REQUIRED: Stable identity from streaming source
  metadataSource: metadataSourceInfoSchema.nullish(), // Optional: Rich metadata ID (when enriched)
  addedAt: z.number(),
  addedBy: userSchema.nullish(), // Can be null or undefined
  addedDuring: z.string().nullish(),
  playedAt: z.number().nullish(),
  pluginData: z.record(z.string(), z.any()).nullish(), // Plugin-augmented metadata
})

export type QueueItem = z.infer<typeof queueItemSchema>

// =============================================================================
// Queue Schema & Type
// =============================================================================

export const queueSchema = z.object({
  items: z.array(queueItemSchema),
})

export type Queue = z.infer<typeof queueSchema>
