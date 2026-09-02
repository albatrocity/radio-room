import type { TradeSession } from "@repo/types"
import {
  tradeAcceptedNotificationId,
  tradeConfirmNotificationId,
  tradeLockNotificationId,
} from "./notificationIds"

export type TradeWatchSnapshot = {
  otherLocked: boolean
  otherConfirmed: boolean
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

/** @deprecated Use tradeAcceptedNotificationId from notificationIds. */
export const tradeAcceptedToastId = tradeAcceptedNotificationId
/** @deprecated Use tradeLockNotificationId from notificationIds. */
export const tradeLockToastId = tradeLockNotificationId
/** @deprecated Use tradeConfirmNotificationId from notificationIds. */
export const tradeConfirmToastId = tradeConfirmNotificationId
