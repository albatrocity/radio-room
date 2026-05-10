import { useLayoutEffect, type RefObject } from "react"
import type { CoinFeedbackAnimationKind } from "../machines/coinGainFeedbackMachine"
import {
  runCoinGainButtonAnimationOrComplete,
  runCoinLossButtonAnimationOrComplete,
} from "./coinGainButtonAnimation"

/**
 * When `active` is true, runs the coin gain or loss timeline on the motion targets
 * depending on `kind`. Calls `onAnimationFinished` after a full run, or immediately if nodes are missing.
 */
export function useCoinFeedbackButtonAnimation(
  active: boolean,
  kind: CoinFeedbackAnimationKind | undefined,
  coinRef: RefObject<HTMLDivElement | null>,
  buttonRef: RefObject<HTMLDivElement | null>,
  onAnimationFinished: () => void,
): void {
  useLayoutEffect(() => {
    if (!active || kind === undefined) return
    if (kind === "gain") {
      return runCoinGainButtonAnimationOrComplete(
        coinRef.current,
        buttonRef.current,
        onAnimationFinished,
      )
    }
    return runCoinLossButtonAnimationOrComplete(
      coinRef.current,
      buttonRef.current,
      onAnimationFinished,
    )
  }, [active, kind, onAnimationFinished])
}
