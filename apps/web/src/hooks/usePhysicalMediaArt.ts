import { useMemo } from "react"
import { usePluginConfigs } from "./useActors"
import {
  resolvePhysicalMediaArt,
  type PhysicalMediaArt,
} from "../lib/physicalMediaArtwork"

export function usePhysicalMediaArt(params: {
  pluginData: Record<string, unknown> | undefined
  trackArtUrl?: string | null
  disabled?: boolean
}): PhysicalMediaArt | undefined {
  const pluginConfigs = usePluginConfigs()
  const { pluginData, trackArtUrl, disabled } = params
  return useMemo(
    () =>
      resolvePhysicalMediaArt({
        pluginData,
        pluginConfigs,
        trackArtUrl: trackArtUrl ?? undefined,
        disabled,
      }),
    [pluginData, pluginConfigs, trackArtUrl, disabled],
  )
}
