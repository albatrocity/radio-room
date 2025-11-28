import { z } from "zod"

/**
 * Zod schema for Playlist Democracy plugin configuration
 */
export const playlistDemocracyConfigSchema = z.object({
  enabled: z.boolean(),
  reactionType: z.string(), // emoji shortcode to count
  timeLimit: z.number().min(10000).max(300000), // milliseconds (10s - 5min)
  thresholdType: z.enum(["percentage", "static"]),
  thresholdValue: z.number().min(1).max(100), // 0-100 for percentage, absolute number for static
})

/**
 * Configuration for the Playlist Democracy plugin
 */
export type PlaylistDemocracyConfig = z.infer<typeof playlistDemocracyConfigSchema>

/**
 * Default configuration values
 */
export const defaultPlaylistDemocracyConfig: PlaylistDemocracyConfig = {
  enabled: false,
  reactionType: "+1",
  timeLimit: 60000, // 60 seconds
  thresholdType: "percentage",
  thresholdValue: 50,
}
