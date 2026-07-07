import { z } from "zod"

export const volumeManagerConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /** Live/current volume (0-100). Applied immediately when changed. */
  volume: z.number().int().min(0).max(100).default(100),
  /** When true, each new track starts at `startVolume`. */
  setOnTrackStart: z.boolean().default(false),
  /** Volume applied at each track start when `setOnTrackStart` is enabled. */
  startVolume: z.number().int().min(0).max(100).default(100),
})

export type VolumeManagerConfig = z.infer<typeof volumeManagerConfigSchema>

export const defaultVolumeManagerConfig: VolumeManagerConfig = {
  enabled: false,
  volume: 100,
  setOnTrackStart: false,
  startVolume: 100,
}

export function clampVolumePercent(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)))
}
