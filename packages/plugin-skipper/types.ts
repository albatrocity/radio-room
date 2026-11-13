import { z } from "zod"

export const SKIPPER_PLUGIN_NAME = "skipper"
export const SKIPPER_PERSONA_ID = "skipper"
export const SKIPPER_PERSONA_FULL_ID = `plugin:${SKIPPER_PLUGIN_NAME}:${SKIPPER_PERSONA_ID}`

export const skipperConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /** Skips each Skipper may use while holding the persona. 0 = unlimited. */
  skipLimit: z.number().int().min(0).default(0),
})

export type SkipperConfig = z.infer<typeof skipperConfigSchema>

export const defaultSkipperConfig: SkipperConfig = {
  enabled: false,
  skipLimit: 0,
}

export type SkipperStore = {
  /** Skipper holders who still have skips left. */
  skipperUserIds: string[]
  canSkip: boolean
}

export const SKIPPER_STORE_KEYS = ["skipperUserIds", "canSkip"] as const

export const EMPTY_SKIPPER_STORE: SkipperStore = {
  skipperUserIds: [],
  canSkip: false,
}

export function skipCountKey(userId: string): string {
  return `skips-used:${userId}`
}
