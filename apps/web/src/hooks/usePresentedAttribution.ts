import { useMemo } from "react"
import { presentedUsername, showXRayPierceIcon } from "../lib/presentedUsername"
import { PIERCE_INDICATOR_ICON } from "../lib/pierceIndicator"
import { getIcon } from "../components/PluginComponents/icons"
import { useHasInventoryPeek } from "./useHasInventoryPeek"
import { useUsername } from "./useActors"

export type PresentedAttribution = {
  /** Name to render for this actor, pierced when the viewer has X-Ray. */
  displayName: string
  /** True when the baked label was a mask and the viewer is seeing through it. */
  pierced: boolean
  /** X-Ray indicator to render beside the name, or undefined when not pierced. */
  PierceIcon: React.ComponentType | undefined
}

/**
 * Resolve action attribution for one actor (ADR 0149 / 0150).
 *
 * Chat, queue and any future attributed surface share this so the true-name
 * expression is written once — computing it twice invites the display name and
 * the pierce indicator to disagree.
 *
 * Not for the listener list: that always shows the true username (ADR 0150 §3).
 */
export function usePresentedAttribution(params: {
  userId: string | undefined | null
  /** Label baked at emit time, which may be a presented-identity mask. */
  bakedUsername: string | undefined | null
  fallback?: string
}): PresentedAttribution {
  const { userId, bakedUsername, fallback = "anonymous" } = params
  const viewerPierces = useHasInventoryPeek()
  const liveUsername = useUsername(userId)

  return useMemo(() => {
    const trueUsername = liveUsername || bakedUsername || fallback
    const pierced = showXRayPierceIcon({
      trueUsername,
      maskedUsername: bakedUsername,
      viewerPierces,
    })
    return {
      displayName: presentedUsername({
        trueUsername,
        maskedUsername: bakedUsername,
        viewerPierces,
      }),
      pierced,
      PierceIcon: pierced ? getIcon(PIERCE_INDICATOR_ICON) : undefined,
    }
  }, [liveUsername, bakedUsername, fallback, viewerPierces])
}
