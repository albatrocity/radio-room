import { toaster } from "../components/ui/toaster"

export function tradeAcceptedToastId(tradeId: string): string {
  return `trade-accepted-${tradeId}`
}

export function tradeLockToastId(tradeId: string): string {
  return `trade-lock-${tradeId}`
}

export function tradeConfirmToastId(tradeId: string): string {
  return `trade-confirm-${tradeId}`
}

export function tradeCompleteToastId(tradeId: string): string {
  return `trade-complete-${tradeId}`
}

export function dismissAcceptedTradeToast(tradeId: string): void {
  toaster.dismiss(tradeAcceptedToastId(tradeId))
}

export function dismissTradeSessionToasts(tradeId: string): void {
  toaster.dismiss(tradeAcceptedToastId(tradeId))
  toaster.dismiss(tradeLockToastId(tradeId))
  toaster.dismiss(tradeConfirmToastId(tradeId))
}
