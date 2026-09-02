import type { TradeSession } from "@repo/types"
import { getIsAdmin } from "../actors/authActor"
import { adminListenerStateActor } from "../actors/adminListenerStateActor"
import { notifyNotificationLocation } from "./notificationLocationSink"
import { activateTrade, deactivateTrade, tradeActor } from "../actors/tradeActor"
import { ADMIN_LISTENERS_TAB } from "../constants/gameStateTabs"
import type { GameStateDetailFrame } from "../types/GameStateDetail"

export type GameStateNavChildSyncInput = {
  navActive: boolean
  tabId: string
  frame: GameStateDetailFrame | null
  allowTrading: boolean
  activeTrade: TradeSession | null
}

/**
 * Child-actor and "this tab/frame is showing" side effects for Game State (ADR 0130 / 0144).
 * Callers pass explicit ids so assign+sync in the same transition can use the new tab/frame.
 */
export function syncGameStateChildActors(input: GameStateNavChildSyncInput): void {
  const { navActive, tabId, frame, allowTrading, activeTrade } = input
  const isAdmin = getIsAdmin()

  const wantAdmin = navActive && isAdmin && tabId === ADMIN_LISTENERS_TAB
  const adminIdle = adminListenerStateActor.getSnapshot().matches("idle")
  if (wantAdmin && adminIdle) {
    adminListenerStateActor.send({ type: "ACTIVATE" })
  } else if (!wantAdmin && !adminIdle) {
    adminListenerStateActor.send({ type: "DEACTIVATE" })
  }

  const wantTrade = navActive && allowTrading
  const tradeActive = tradeActor.getSnapshot().matches("active")
  if (wantTrade) {
    activateTrade(activeTrade)
  } else if (tradeActive) {
    deactivateTrade()
  }

  notifyNotificationLocation(
    navActive
      ? { surface: "gameState", tabId, frame }
      : { surface: null },
  )
}
