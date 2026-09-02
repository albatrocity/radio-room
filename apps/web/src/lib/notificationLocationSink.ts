import type { NotificationLocation } from "../types/Notification"

type Sink = (location: NotificationLocation) => void

let sink: Sink | null = null

/**
 * Wired from `notificationsActor` at module load so nav effects need not import
 * the notifications actor (avoids cycles through modals → nav → effects).
 */
export function bindNotificationLocationSink(next: Sink | null): void {
  sink = next
}

export function notifyNotificationLocation(location: NotificationLocation): void {
  sink?.(location)
}
