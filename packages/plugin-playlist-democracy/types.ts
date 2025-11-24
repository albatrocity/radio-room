/**
 * Configuration for the Playlist Democracy plugin
 */
export type PlaylistDemocracyConfig = {
  enabled: boolean
  reactionType: string // emoji shortcode to count
  timeLimit: number // milliseconds (default: 60000)
  thresholdType: "percentage" | "static"
  thresholdValue: number // 0-100 for percentage, absolute number for static
}

