/**
 * Global notifications actor (ADR 0144).
 * Always-on singleton; room-scoped via ROOM_ENTERED / ROOM_LEFT.
 */

import { createActor } from "xstate"
import {
  notificationsMachine,
  type NotificationsContext,
} from "../machines/notificationsMachine"
import { bindNotificationLocationSink } from "../lib/notificationLocationSink"
import type {
  NotificationLocation,
  NotificationSpec,
  NotificationSurface,
} from "../types/Notification"

export const notificationsActor = createActor(notificationsMachine).start()

bindNotificationLocationSink((location) => {
  notificationsActor.send({ type: "LOCATION_CHANGED", location })
})

export function raiseNotification(spec: NotificationSpec): void {
  notificationsActor.send({ type: "RAISE", spec })
}

export function resolveNotifications(ids: string[]): void {
  if (ids.length === 0) return
  notificationsActor.send({ type: "RESOLVE", ids })
}

export function reconcileNotifications(source: string, keepIds: string[]): void {
  notificationsActor.send({ type: "RECONCILE", source, keepIds })
}

export function getNotificationLocation(): NotificationLocation {
  return notificationsActor.getSnapshot().context.location
}

export function notifyRoomEntered(roomId: string): void {
  notificationsActor.send({ type: "ROOM_ENTERED", roomId })
}

export function notifyRoomLeft(): void {
  notificationsActor.send({ type: "ROOM_LEFT" })
}

export function setNotificationLocation(location: NotificationLocation): void {
  notificationsActor.send({ type: "LOCATION_CHANGED", location })
}

/** Any stored item whose target is on this surface (drives entry-point dots). */
export function surfaceHasNotifications(
  context: NotificationsContext,
  surface: NotificationSurface,
): boolean {
  return Object.values(context.items).some(
    (item) => item.target?.surface === surface,
  )
}

/** Tab ids with active notifications on a gameState surface. */
export function tabNotificationIds(
  context: NotificationsContext,
  surface: NotificationSurface = "gameState",
): Set<string> {
  const ids = new Set<string>()
  for (const item of Object.values(context.items)) {
    if (item.target?.surface === surface) {
      ids.add(item.target.tabId)
    }
  }
  return ids
}
