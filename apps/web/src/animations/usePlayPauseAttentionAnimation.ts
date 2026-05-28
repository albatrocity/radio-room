import { useLayoutEffect, type RefObject } from "react"
import { runPlayPauseAttentionLoop } from "./playPauseButtonAnimation"

/**
 * While `active` is true, runs the looping wiggle/jump on `buttonRef`.
 * Cleans up when `active` becomes false or the component unmounts.
 */
export function usePlayPauseAttentionAnimation(
  active: boolean,
  buttonRef: RefObject<HTMLElement | null>,
): void {
  useLayoutEffect(() => {
    if (!active) return
    const el = buttonRef.current
    if (!el) return
    return runPlayPauseAttentionLoop(el)
  }, [active, buttonRef])
}
