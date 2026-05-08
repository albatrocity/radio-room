import { useMemo } from "react"
import { Box } from "@chakra-ui/react"
import { countInterfaceBlurStacks, countInterfaceSaturateStacks } from "@repo/game-logic"
import { interfaceBlurPx, interfaceModifierBackdropStyle } from "../lib/screenEffects"
import { useAnimationsEnabled } from "../hooks/useReducedMotion"
import { useCurrentUser, useNow, useUserModifiers } from "../hooks/useActors"

/** Below typical portaled modal layers; above main room chrome. */
const BLUR_LAYER_Z_INDEX = 500

/**
 * Full-viewport `backdrop-filter` when the current user has active interface modifiers:
 * stackable blur (`INTERFACE_BLUR_FLAG`) and/or saturation (`INTERFACE_SATURATE_FLAG`).
 * Blur respects reduced motion; saturation stays on (static filter, not animation).
 */
export function ModifierBlurLayer() {
  const user = useCurrentUser()
  const modifiers = useUserModifiers(user?.userId)
  const now = useNow()
  const animationsEnabled = useAnimationsEnabled()

  const blurStacks = useMemo(() => countInterfaceBlurStacks(modifiers, now), [modifiers, now])
  const saturateStacks = useMemo(() => countInterfaceSaturateStacks(modifiers, now), [modifiers, now])

  const blurPx = animationsEnabled ? interfaceBlurPx(blurStacks) : 0

  if (blurPx <= 0 && saturateStacks <= 0) return null

  return (
    <Box
      aria-hidden
      zIndex={BLUR_LAYER_Z_INDEX}
      style={interfaceModifierBackdropStyle({
        blurPx,
        saturateStackCount: saturateStacks,
      })}
    />
  )
}
