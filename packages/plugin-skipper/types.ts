import { z } from "zod"

export const SKIPPER_PLUGIN_NAME = "skipper"
export const SKIPPER_PERSONA_ID = "skipper"
export const SKIPPER_PERSONA_FULL_ID = `plugin:${SKIPPER_PLUGIN_NAME}:${SKIPPER_PERSONA_ID}`

export const skipperConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /** Skips each Skipper may use while holding the persona. 0 = unlimited. */
  skipLimit: z.number().int().min(0).default(0),
  /**
   * When true, the listener who queued the now-playing track may skip it
   * without holding the Skipper persona (ADR 0210).
   */
  skipOwnTracks: z.boolean().default(false),
})

export type SkipperConfig = z.infer<typeof skipperConfigSchema>

export const defaultSkipperConfig: SkipperConfig = {
  enabled: false,
  skipLimit: 0,
  skipOwnTracks: false,
}

export type SkipperStore = {
  /** Skipper holders who still have skips left. */
  skipperUserIds: string[]
  /**
   * User ids that may skip because they queued the now-playing track
   * (`skipOwnTracks` and room is skippable). At most one id.
   */
  ownTrackUserIds: string[]
  canSkip: boolean
}

export const SKIPPER_STORE_KEYS = ["skipperUserIds", "ownTrackUserIds", "canSkip"] as const

export const EMPTY_SKIPPER_STORE: SkipperStore = {
  skipperUserIds: [],
  ownTrackUserIds: [],
  canSkip: false,
}

export function skipCountKey(userId: string): string {
  return `skips-used:${userId}`
}
