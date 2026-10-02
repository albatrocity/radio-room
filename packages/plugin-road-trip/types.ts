import { z } from "zod"

export const PLUGIN_NAME = "road-trip"
export const ROAD_TRIP_TAB_ID = "trip"

/**
 * Config is small on purpose: trip mode is "a map is loaded" (D2), not
 * `enabled`. `enabled` only shows road-trip in the Quick Access menu. The
 * `trip*` fields are Quick Access status lines; their live values come from
 * the plugin store (ADR 0200), the config copies are only fallbacks.
 */
export const roadTripConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /** IANA zone for clock times in the room-export timeline. */
  exportTimeZone: z.string().min(1).default("UTC"),
  tripProgress: z.string().default("No map loaded"),
  tripEta: z.string().default("—"),
  tripNextSite: z.string().default("—"),
  tripWarnings: z.string().default("None"),
})

export type RoadTripConfig = z.infer<typeof roadTripConfigSchema>

export const defaultRoadTripConfig: RoadTripConfig = {
  enabled: false,
  exportTimeZone: "UTC",
  tripProgress: "No map loaded",
  tripEta: "—",
  tripNextSite: "—",
  tripWarnings: "None",
}

export const TRIP_STORE_KEYS = [
  "tripActive",
  "trip",
  "tripProgress",
  "tripEta",
  "tripNextSite",
  "tripWarnings",
] as const

/** Skip polls give up and apply the default this close to the exit (M1). */
export const POLL_GIVE_UP_BEFORE_EXIT_MS = 15_000
/** Polls close at the latest this long before the exit. */
export const POLL_CLOSE_BEFORE_EXIT_MS = 10_000
/** Retry interval while another poll holds the room's single poll slot. */
export const POLL_RETRY_MS = 5_000
/** Core minimum poll duration (ADR 0189). */
export const POLL_MIN_DURATION_MS = 5_000

export const SKIP_POLL_OPTIONS = [{ label: "Pull off" }, { label: "Keep driving" }] as const
