import { useCallback } from "react"
import { openGameStateOnTab } from "../../../actors/modalsActor"
import { useGameStateNavSend, useIsGameStateNavActive } from "../../../hooks/useActors"
import type { GameStateDetailFrame } from "../../../types/GameStateDetail"

/**
 * Push a detail frame onto the active tab, or deep-link into Game State.
 */
export function useOpenTabDetail(tabId: string): (frame: GameStateDetailFrame) => void {
  const isNavActive = useIsGameStateNavActive()
  const sendNav = useGameStateNavSend()
  return useCallback(
    (frame: GameStateDetailFrame) => {
      if (isNavActive) {
        sendNav({ type: "PUSH_DETAIL", frame })
        return
      }
      openGameStateOnTab({ tabId, frame })
    },
    [isNavActive, sendNav, tabId],
  )
}
