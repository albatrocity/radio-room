import type {
  NotificationLocation,
  NotificationTarget,
} from "../types/Notification"
import { isTradeDetailFrame } from "../types/GameStateDetail"

/** True when the user's current location covers the notification's target. */
export function locationMatchesTarget(
  location: NotificationLocation,
  target: NotificationTarget | null,
): boolean {
  if (!target) return false
  if (location.surface !== target.surface) return false

  if (location.surface === "feedback" && target.surface === "feedback") {
    return true
  }

  if (location.surface === "adminSettings" && target.surface === "adminSettings") {
    return location.tabId === target.tabId
  }

  if (location.surface === "gameState" && target.surface === "gameState") {
    if (location.tabId !== target.tabId) return false
    if (!target.frame) return true
    const frame = location.frame
    if (!frame || frame.kind !== target.frame.kind) return false
    if (isTradeDetailFrame(target.frame) && isTradeDetailFrame(frame)) {
      return frame.tradeId === target.frame.tradeId
    }
    if (frame.kind === "item" && target.frame.kind === "item") {
      return (
        frame.shortId === target.frame.shortId &&
        frame.source === target.frame.source
      )
    }
    return false
  }

  return false
}

/** True when location is on the same surface as target (any tab/frame). */
export function locationMatchesSurface(
  location: NotificationLocation,
  target: NotificationTarget | null,
): boolean {
  if (!target) return false
  return location.surface === target.surface
}
