/**
 * Client notification center (ADR 0144).
 *
 * Headless store of attention records + toast side effects. Sources raise/resolve;
 * UI location is fed via LOCATION_CHANGED. No rich lifecycle states — a policy
 * engine over a keyed collection.
 */

import { assign, setup } from "xstate"
import {
  loadPersistedNotifications,
  savePersistedNotifications,
} from "../lib/notificationPersistence"
import {
  createNotificationToast,
  dismissNotificationToast,
} from "../lib/notificationToastPort"
import {
  locationMatchesSurface,
  locationMatchesTarget,
} from "../lib/notificationTargets"
import type {
  NotificationLocation,
  NotificationSpec,
} from "../types/Notification"

export type NotificationsContext = {
  roomId: string | null
  location: NotificationLocation
  items: Record<string, NotificationSpec>
  /** Specs whose toasts should be created after the current transition's assign. */
  pendingToastIds: string[]
  /** Specs whose toasts should be dismissed after the current transition's assign. */
  pendingDismissIds: string[]
}

export type NotificationsEvent =
  | { type: "ROOM_ENTERED"; roomId: string }
  | { type: "ROOM_LEFT" }
  | { type: "RAISE"; spec: NotificationSpec }
  | { type: "RESOLVE"; ids: string[] }
  | { type: "RECONCILE"; source: string; keepIds: string[] }
  | { type: "LOCATION_CHANGED"; location: NotificationLocation }

function shouldShowToast(
  spec: NotificationSpec,
  location: NotificationLocation,
): boolean {
  if (!spec.toast) return false
  if (!spec.target) return true
  if (locationMatchesTarget(location, spec.target)) return false
  return true
}

function persistItems(roomId: string | null, items: Record<string, NotificationSpec>): void {
  savePersistedNotifications(roomId, items)
}

export const notificationsMachine = setup({
  types: {
    context: {} as NotificationsContext,
    events: {} as NotificationsEvent,
  },
  actions: {
    enterRoom: assign(({ event }) => {
      if (event.type !== "ROOM_ENTERED") return {}
      return {
        roomId: event.roomId,
        items: loadPersistedNotifications(event.roomId),
        location: { surface: null } as NotificationLocation,
        pendingToastIds: [] as string[],
        pendingDismissIds: [] as string[],
      }
    }),
    leaveRoom: assign(() => ({
      roomId: null as string | null,
      items: {} as Record<string, NotificationSpec>,
      location: { surface: null } as NotificationLocation,
      pendingToastIds: [] as string[],
      pendingDismissIds: [] as string[],
    })),
    raiseItem: assign(({ context, event }) => {
      if (event.type !== "RAISE") return {}
      const spec = event.spec

      // Idempotent by id. Allow upgrade: silent store → later live raise with toast
      // (USER_GAME_STATE can race ahead of GIFT_OFFERED / TRADE_INVITE_OFFERED).
      const existing = context.items[spec.id]
      if (existing) {
        if (
          !existing.toast &&
          spec.toast &&
          shouldShowToast(spec, context.location)
        ) {
          const nextItems = { ...context.items, [spec.id]: { ...existing, ...spec } }
          persistItems(context.roomId, nextItems)
          return {
            items: nextItems,
            pendingToastIds: [spec.id],
            pendingDismissIds: [] as string[],
          }
        }
        return { pendingToastIds: [] as string[], pendingDismissIds: [] as string[] }
      }

      // view-type + already at target → drop (no store, no toast).
      if (
        spec.clearOn === "view" &&
        spec.target &&
        locationMatchesTarget(context.location, spec.target)
      ) {
        return { pendingToastIds: [] as string[], pendingDismissIds: [] as string[] }
      }

      const toastIds = shouldShowToast(spec, context.location) ? [spec.id] : []

      // Toast-only (no target): fire toast, do not keep an indicator record.
      if (!spec.target) {
        return {
          pendingToastIds: toastIds,
          pendingDismissIds: [] as string[],
        }
      }

      const nextItems = { ...context.items, [spec.id]: spec }
      persistItems(context.roomId, nextItems)
      return {
        items: nextItems,
        pendingToastIds: toastIds,
        pendingDismissIds: [] as string[],
      }
    }),
    resolveItems: assign(({ context, event }) => {
      if (event.type !== "RESOLVE") return {}
      const next = { ...context.items }
      const dismissIds: string[] = []
      for (const id of event.ids) {
        const existing = next[id]
        if (!existing) {
          // Still dismiss toast if a toast-only raise used this id.
          dismissIds.push(id)
          continue
        }
        if (existing.toast) dismissIds.push(id)
        delete next[id]
      }
      persistItems(context.roomId, next)
      return {
        items: next,
        pendingToastIds: [] as string[],
        pendingDismissIds: dismissIds,
      }
    }),
    reconcileSource: assign(({ context, event }) => {
      if (event.type !== "RECONCILE") return {}
      const keep = new Set(event.keepIds)
      const next = { ...context.items }
      const dismissIds: string[] = []
      for (const [id, spec] of Object.entries(context.items)) {
        if (spec.source !== event.source) continue
        if (keep.has(id)) continue
        if (spec.toast) dismissIds.push(id)
        delete next[id]
      }
      persistItems(context.roomId, next)
      return {
        items: next,
        pendingToastIds: [] as string[],
        pendingDismissIds: dismissIds,
      }
    }),
    applyLocation: assign(({ context, event }) => {
      if (event.type !== "LOCATION_CHANGED") return {}
      const location = event.location
      const next = { ...context.items }
      const dismissIds: string[] = []

      for (const [id, spec] of Object.entries(context.items)) {
        if (!spec.target) continue

        const atTarget = locationMatchesTarget(location, spec.target)
        const atSurface = locationMatchesSurface(location, spec.target)
        const dismissMode = spec.dismissToastOn ?? "target"

        if (spec.clearOn === "view" && atTarget) {
          if (spec.toast) dismissIds.push(id)
          delete next[id]
          continue
        }

        if (spec.toast) {
          if (dismissMode === "target" && atTarget) {
            dismissIds.push(id)
          } else if (dismissMode === "surface" && atSurface) {
            dismissIds.push(id)
          }
        }
      }

      persistItems(context.roomId, next)
      return {
        location,
        items: next,
        pendingToastIds: [] as string[],
        pendingDismissIds: dismissIds,
      }
    }),
    flushToasts: ({ context, event }) => {
      for (const id of context.pendingDismissIds) {
        dismissNotificationToast(id)
      }
      if (event.type === "RAISE") {
        const spec = event.spec
        if (context.pendingToastIds.includes(spec.id) && spec.toast) {
          createNotificationToast({
            id: spec.id,
            toast: spec.toast,
            target: spec.target,
          })
        }
      }
    },
    clearPending: assign({
      pendingToastIds: () => [],
      pendingDismissIds: () => [],
    }),
  },
}).createMachine({
  id: "notifications",
  context: {
    roomId: null,
    location: { surface: null },
    items: {},
    pendingToastIds: [],
    pendingDismissIds: [],
  },
  on: {
    ROOM_ENTERED: { actions: "enterRoom" },
    ROOM_LEFT: { actions: "leaveRoom" },
    RAISE: { actions: ["raiseItem", "flushToasts", "clearPending"] },
    RESOLVE: { actions: ["resolveItems", "flushToasts", "clearPending"] },
    RECONCILE: { actions: ["reconcileSource", "flushToasts", "clearPending"] },
    LOCATION_CHANGED: { actions: ["applyLocation", "flushToasts", "clearPending"] },
  },
})
