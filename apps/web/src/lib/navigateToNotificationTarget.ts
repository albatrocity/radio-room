import { openGameStateOnTab } from "../actors/modalsActor"
import type { NotificationTarget } from "../types/Notification"

/** Deep-link router: open the UI that the notification points at. */
export function navigateToTarget(target: NotificationTarget): void {
  switch (target.surface) {
    case "gameState":
      openGameStateOnTab({
        tabId: target.tabId,
        frame: target.frame,
      })
      break
    default: {
      const _exhaustive: never = target
      void _exhaustive
    }
  }
}
