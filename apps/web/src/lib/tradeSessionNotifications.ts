import type { TradeSession } from "@repo/types"
import { gameStateNavActor } from "../actors/gameStateNavActor"
import { isModalOpen } from "../actors/modalsActor"
import { markTradesGiftsSessionViewed } from "../actors/gameStateTradesGiftsAttentionActor"
import { currentDetailFrame } from "../machines/gameStateNavMachine"
import { isTradeDetailFrame } from "../types/GameStateDetail"
import { toaster } from "../components/ui/toaster"

export type TradeWatchSnapshot = {
  otherLocked: boolean
  otherConfirmed: boolean
}

export function tradeAcceptedToastId(tradeId: string): string {
  return `trade-accepted-${tradeId}`
}

export function tradeLockToastId(tradeId: string): string {
  return `trade-lock-${tradeId}`
}

export function tradeConfirmToastId(tradeId: string): string {
  return `trade-confirm-${tradeId}`
}

export function dismissAcceptedTradeToast(tradeId: string): void {
  toaster.dismiss(tradeAcceptedToastId(tradeId))
}

export function dismissTradeSessionToasts(tradeId: string): void {
  toaster.dismiss(tradeAcceptedToastId(tradeId))
  toaster.dismiss(tradeLockToastId(tradeId))
  toaster.dismiss(tradeConfirmToastId(tradeId))
}

export function watchSnapshotForUser(
  trade: TradeSession,
  me: string,
): TradeWatchSnapshot | null {
  if (!trade.participants[me]) return null
  const otherId = trade.fromUserId === me ? trade.toUserId : trade.fromUserId
  const other = trade.participants[otherId]
  return {
    otherLocked: Boolean(other?.locked),
    otherConfirmed: Boolean(other?.confirmed),
  }
}

/** Counterpart lock / confirm transitions that warrant a toast when the session is not open. */
export function counterpartTradeAlerts(
  prev: TradeWatchSnapshot | undefined,
  next: TradeWatchSnapshot & { iConfirmed: boolean },
): Array<"lock" | "confirm"> {
  if (!prev) return []
  const alerts: Array<"lock" | "confirm"> = []
  if (!prev.otherLocked && next.otherLocked) alerts.push("lock")
  if (!prev.otherConfirmed && next.otherConfirmed && !next.iConfirmed) {
    alerts.push("confirm")
  }
  return alerts
}

export function isViewingTradeSession(tradeId: string): boolean {
  if (!isModalOpen("gameState")) return false
  const snap = gameStateNavActor.getSnapshot()
  if (!snap.matches("active")) return false
  const frame = currentDetailFrame(snap.context)
  return isTradeDetailFrame(frame) && frame.tradeId === tradeId
}

export function onTradeSessionViewed(tradeId: string): void {
  dismissTradeSessionToasts(tradeId)
  markTradesGiftsSessionViewed()
}
