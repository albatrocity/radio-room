import { useCallback } from "react"
import { openGameStateItemDetail } from "../../../actors/modalsActor"
import type { GameStateDetailFrame } from "../../../types/GameStateDetail"
import { useGameStateNavOptional } from "./GameStateNavContext"

/**
 * Opens an item detail frame from an index surface (ADR 0104).
 *
 * Inside the Game State modal the nav stack owns the transition; a plugin
 * component rendered elsewhere in the room has no stack, so the modal has to be
 * opened onto `tabId` first.
 */
export function useOpenItemDetail(tabId: string): (frame: GameStateDetailFrame) => void {
  const nav = useGameStateNavOptional()
  return useCallback(
    (frame: GameStateDetailFrame) => {
      if (nav) {
        nav.pushDetail(frame)
        return
      }
      openGameStateItemDetail({ tabId, frame })
    },
    [nav, tabId],
  )
}
