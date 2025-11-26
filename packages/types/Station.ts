import { z } from "zod"

// =============================================================================
// Station Schema & Type
// =============================================================================

export const stationSchema = z.object({
  bitrate: z.string(),
  title: z.string().optional(),
  listeners: z.string().optional(),
  fetchSource: z.string().optional(),
})

export type Station = z.infer<typeof stationSchema>
