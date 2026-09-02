import type { GameStateDetailFrame } from "./GameStateDetail"

/** Where a notification points the user (entry point + optional detail frame). */
export type NotificationTarget =
  | { surface: "gameState"; tabId: string; frame?: GameStateDetailFrame }
// Future surfaces extend this union (e.g. { surface: "polls" }).

/** Current UI location the user is looking at (fed by nav / panel lifecycle). */
export type NotificationLocation =
  | { surface: null }
  | { surface: "gameState"; tabId: string; frame: GameStateDetailFrame | null }

export type NotificationToastAction =
  | "open"
  | { label: string; onClick: () => void }

export type NotificationToastSpec = {
  title: string
  description?: string
  type?: "info" | "success" | "warning" | "error"
  duration?: number
  action?: NotificationToastAction
  secondaryAction?: { label: string; onClick: () => void }
}

/**
 * A single attention record. Headless: drives indicators + optional toast side effects.
 * No inbox UI — consumers read via useSurfaceHasNotifications / useTabNotificationIds.
 */
export type NotificationSpec = {
  /** Stable; doubles as the toast id. */
  id: string
  /** Domain source for RECONCILE scoping. */
  source: string
  /** null => toast-only notice, no indicator. */
  target: NotificationTarget | null
  /**
   * view: flash — dropped once location reaches target.
   * resolve: stays until RESOLVE / RECONCILE (server-backed pending offers).
   */
  clearOn: "view" | "resolve"
  /** sessionStorage per room (plugin tabs today). */
  persist?: boolean
  toast?: NotificationToastSpec
  /** Default "target". */
  dismissToastOn?: "target" | "surface" | "never"
}

export type NotificationSurface = NonNullable<NotificationTarget>["surface"]
