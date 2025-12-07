import { z } from "zod"
import { metadataSourceTrackSchema } from "./MetadataSource"
import { userSchema } from "./User"
import { mediaSourceInfoSchema, metadataSourceInfoSchema, metadataSourceTypeSchema } from "./TrackSource"

// =============================================================================
// MetadataSourceTrackData Schema & Type
// Contains both the source info (type + trackId) and the full track data
// =============================================================================

export const metadataSourceTrackDataSchema = z.object({
  source: metadataSourceInfoSchema,
  track: metadataSourceTrackSchema,
})
export type MetadataSourceTrackData = z.infer<typeof metadataSourceTrackDataSchema>

// =============================================================================
// QueueItem Schema & Type
// =============================================================================

export const queueItemSchema = z.object({
  title: z.string(),
  track: metadataSourceTrackSchema, // Default/primary track data for backward compatibility
  mediaSource: mediaSourceInfoSchema, // REQUIRED: Stable identity from streaming source
  metadataSource: metadataSourceInfoSchema.nullish(), // Optional: Primary metadata source ID (when enriched)
  // Multiple metadata sources - keyed by source type (spotify, tidal, etc.)
  // Using optional value to allow partial records (not all sources will have data)
  metadataSources: z.record(metadataSourceTypeSchema, metadataSourceTrackDataSchema.optional()).nullish(),
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
