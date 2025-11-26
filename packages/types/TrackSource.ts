import { z } from "zod"

/**
 * Track source type definitions for separating MediaSource and MetadataSource identities
 */

// =============================================================================
// MediaSource Schema & Types
// =============================================================================

export const mediaSourceTypeSchema = z.enum(["spotify", "shoutcast", "applemusic"])
export type MediaSourceType = z.infer<typeof mediaSourceTypeSchema>

export const mediaSourceInfoSchema = z.object({
  type: mediaSourceTypeSchema,
  trackId: z.string(),
})
export type MediaSourceInfo = z.infer<typeof mediaSourceInfoSchema>

// =============================================================================
// MetadataSource Schema & Types
// =============================================================================

export const metadataSourceTypeSchema = z.enum(["spotify", "tidal", "applemusic"])
export type MetadataSourceType = z.infer<typeof metadataSourceTypeSchema>

export const metadataSourceInfoSchema = z.object({
  type: metadataSourceTypeSchema,
  trackId: z.string(),
})
export type MetadataSourceInfo = z.infer<typeof metadataSourceInfoSchema>
