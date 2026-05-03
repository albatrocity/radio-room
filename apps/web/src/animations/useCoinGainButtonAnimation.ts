import { useLayoutEffect, type RefObject } from "react"
import { runCoinGainButtonAnimationOrComplete } from "./coinGainButtonAnimation"

/**
 * When `active` is true, runs the coin-gain timeline on the motion targets.
 * Calls `onAnimationFinished` after a full run, or immediately if nodes are missing.
 */
export function useCoinGainButtonAnimation(
  active: boolean,
  coinRef: RefObject<HTMLDivElement | null>,
  buttonRef: RefObject<HTMLDivElement | null>,
  onAnimationFinished: () => void,
): void {
  // Refs omitted from deps — `.current` is read when `active` becomes true after layout.
  useLayoutEffect(() => {
    if (!active) return
    return runCoinGainButtonAnimationOrComplete(
      coinRef.current,
      buttonRef.current,
      onAnimationFinished,
    )
  }, [active, onAnimationFinished])
}
