import { z } from "zod"
import { mediaSourceTypeSchema } from "./TrackSource"

export const trackStatsIdentityQuerySchema = z.object({
  mediaSourceType: mediaSourceTypeSchema,
  mediaSourceTrackId: z.string().min(1),
  spotifyTrackId: z.string().min(1).optional(),
  tidalTrackId: z.string().min(1).optional(),
})

export type TrackStatsIdentityQuery = z.infer<typeof trackStatsIdentityQuerySchema>

export const trackStatsAppearanceSchema = z.object({
  showTitle: z.string(),
  addedByUsername: z.string(),
  addedAt: z.string(),
})

export type TrackStatsAppearance = z.infer<typeof trackStatsAppearanceSchema>

export const trackStatsFirstAppearanceSchema = z.object({
  showTitle: z.string(),
  addedAt: z.string(),
})

export type TrackStatsFirstAppearance = z.infer<typeof trackStatsFirstAppearanceSchema>

export const trackStatsTopDjSchema = z.object({
  username: z.string(),
  count: z.number().int().nonnegative(),
})

export type TrackStatsTopDj = z.infer<typeof trackStatsTopDjSchema>

export const trackStatsDtoSchema = z.object({
  firstPlay: z.boolean(),
  showCount: z.number().int().nonnegative(),
  appearanceCount: z.number().int().nonnegative(),
  firstAppearance: trackStatsFirstAppearanceSchema.nullable(),
  recentAppearances: z.array(trackStatsAppearanceSchema),
  topDjs: z.array(trackStatsTopDjSchema),
})

export type TrackStatsDTO = z.infer<typeof trackStatsDtoSchema>
