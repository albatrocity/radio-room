import { useMemo } from "react"
import { Box } from "@chakra-ui/react"
import { countInterfaceBlurStacks } from "@repo/game-logic"
import { interfaceBlurOverlayStyle, interfaceBlurPx } from "../lib/screenEffects"
import { useAnimationsEnabled } from "../hooks/useReducedMotion"
import { useCurrentUser, useNow, useUserModifiers } from "../hooks/useActors"

/** Below typical portaled modal layers; above main room chrome. */
const BLUR_LAYER_Z_INDEX = 500

/**
 * Full-viewport backdrop blur when the current user has active `INTERFACE_BLUR_FLAG`
 * modifiers. Stacks like chat text effects (one stack per concurrent modifier).
 */
export function ModifierBlurLayer() {
  const user = useCurrentUser()
  const modifiers = useUserModifiers(user?.userId)
  const now = useNow()
  const animationsEnabled = useAnimationsEnabled()

  const stacks = useMemo(() => countInterfaceBlurStacks(modifiers, now), [modifiers, now])
  const blurPx = animationsEnabled ? interfaceBlurPx(stacks) : 0

  if (blurPx <= 0) return null

  return (
    <Box aria-hidden zIndex={BLUR_LAYER_Z_INDEX} style={interfaceBlurOverlayStyle(blurPx)} />
  )
}
