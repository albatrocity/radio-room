import { emitToSocket } from "../actors/socketActor"

/** Trade ids cancelled locally before TRADE_CANCELLED arrives (covers studio / race). */
const cancelledByMe = new Set<string>()

export function markTradeCancelledByMe(tradeId: string): void {
  cancelledByMe.add(tradeId)
  window.setTimeout(() => cancelledByMe.delete(tradeId), 30_000)
}

export function wasTradeCancelledByMe(tradeId: string): boolean {
  return cancelledByMe.has(tradeId)
}

export function clearTradeCancelledByMe(tradeId: string): void {
  cancelledByMe.delete(tradeId)
}

export function emitTradeCancel(tradeId: string): void {
  markTradeCancelledByMe(tradeId)
  emitToSocket("TRADE_CANCEL", { tradeId })
}
