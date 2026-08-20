import { useCallback } from "react"
import { openGameStateItemDetail } from "../../../actors/modalsActor"
import { useGameStateNavSend, useIsGameStateNavActive } from "../../../hooks/useActors"
import type { GameStateDetailFrame } from "../../../types/GameStateDetail"

/**
 * Opens an item detail frame from an index surface (ADR 0104/0106).
 *
 * With the Game State modal already showing, the frame is pushed onto the tab
 * being viewed; a plugin component rendered elsewhere in the room has to open
 * the modal onto `tabId` first.
 */
export function useOpenItemDetail(tabId: string): (frame: GameStateDetailFrame) => void {
  const isNavActive = useIsGameStateNavActive()
  const sendNav = useGameStateNavSend()
  return useCallback(
    (frame: GameStateDetailFrame) => {
      if (isNavActive) {
        sendNav({ type: "PUSH_DETAIL", frame })
        return
      }
      openGameStateItemDetail({ tabId, frame })
    },
    [isNavActive, sendNav, tabId],
  )
}
