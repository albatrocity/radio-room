import type { TradeSession } from "@repo/types"
import { getIsAdmin } from "../actors/authActor"
import { adminListenerStateActor } from "../actors/adminListenerStateActor"
import { markTradesGiftsSessionViewed } from "../actors/gameStateTradesGiftsAttentionActor"
import { activateTrade, deactivateTrade, tradeActor } from "../actors/tradeActor"
import {
  ADMIN_LISTENERS_TAB,
  isCoreGameStateTab,
  TRADES_GIFTS_TAB,
} from "../constants/gameStateTabs"
import type { GameStateDetailFrame } from "../types/GameStateDetail"
import { isTradeDetailFrame } from "../types/GameStateDetail"
import { markGameStatePluginTabViewed } from "./gameStatePluginTabViewed"
import { dismissAcceptedTradeToast, dismissTradeSessionToasts } from "./tradeToasts"
import { viewTradesGiftsTab } from "./tradesGiftsAttention"

export type GameStateNavChildSyncInput = {
  navActive: boolean
  tabId: string
  frame: GameStateDetailFrame | null
  allowTrading: boolean
  activeTrade: TradeSession | null
}

/**
 * Child-actor and "this tab/frame is showing" side effects for Game State (ADR 0130).
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

  if (!navActive) return

  if (tabId === TRADES_GIFTS_TAB) {
    viewTradesGiftsTab()
  } else if (!isCoreGameStateTab(tabId)) {
    markGameStatePluginTabViewed(tabId)
  }

  const tradeId = activeTrade?.tradeId
  if (tradeId) dismissAcceptedTradeToast(tradeId)

  if (frame && isTradeDetailFrame(frame)) {
    dismissTradeSessionToasts(frame.tradeId)
    markTradesGiftsSessionViewed()
  }
}
