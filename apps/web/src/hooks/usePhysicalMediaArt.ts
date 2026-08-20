import { useMemo } from "react"
import { usePhysicalMediaFramesEnabled } from "./useActors"
import { resolvePhysicalMediaArt, type PhysicalMediaArt } from "../lib/physicalMediaArtwork"

/**
 * Runs on every playlist, queue, and Now Playing row, so it subscribes to a
 * single boolean rather than the plugin config record.
 */
export function usePhysicalMediaArt(params: {
  pluginData: Record<string, unknown> | undefined
  trackArtUrl?: string | null
  disabled?: boolean
}): PhysicalMediaArt | undefined {
  const framesEnabled = usePhysicalMediaFramesEnabled()
  const { pluginData, trackArtUrl, disabled } = params
  return useMemo(
    () =>
      resolvePhysicalMediaArt({
        pluginData,
        framesEnabled,
        trackArtUrl: trackArtUrl ?? undefined,
        disabled,
      }),
    [pluginData, framesEnabled, trackArtUrl, disabled],
  )
}
