import { z } from "zod"

// =============================================================================
// Settings Schema & Type
// =============================================================================

export const settingsSchema = z.object({
  fetchMeta: z.boolean(),
  extraInfo: z.string().optional(),
  password: z.string().nullable(),
  deputizeOnJoin: z.boolean(),
  enableSpotifyLogin: z.boolean(),
  artwork: z.string().optional(),
})

export type Settings = z.infer<typeof settingsSchema>
