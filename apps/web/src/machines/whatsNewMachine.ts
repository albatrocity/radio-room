/**
 * What’s new — bundled markdown changelog attention (ADR 0177).
 */

import { assign, setup } from "xstate"
import whatsNewRaw from "../content/whats-new.md?raw"
import {
  raiseNotification,
  reconcileNotifications,
  resolveNotifications,
} from "../actors/notificationsActor"
import { latestWhatsNewMonthId, parseWhatsNew, type WhatsNewMonth } from "../lib/parseWhatsNew"
import { whatsNewMonthNotificationId } from "../lib/whatsNewNotificationIds"
import {
  hasViewedWhatsNewMonth,
  markWhatsNewMonthViewed,
} from "../lib/whatsNewViewedPreference"

const WHATS_NEW_SOURCE = "whats-new"

export interface WhatsNewContext {
  months: WhatsNewMonth[]
  latestMonthId: string | null
}

type WhatsNewEvent =
  | { type: "ACTIVATE" }
  | { type: "DEACTIVATE" }
  | { type: "MARK_VIEWED" }
  | { type: "REFRESH" }

function syncUnreadNotification(latestMonthId: string | null): void {
  if (!latestMonthId) {
    reconcileNotifications(WHATS_NEW_SOURCE, [])
    return
  }
  const id = whatsNewMonthNotificationId(latestMonthId)
  if (!hasViewedWhatsNewMonth(latestMonthId)) {
    raiseNotification({
      id,
      source: WHATS_NEW_SOURCE,
      target: { surface: "whatsNew" },
      clearOn: "view",
      persist: true,
    })
  }
  reconcileNotifications(WHATS_NEW_SOURCE, [id])
}

function loadMonths(): Pick<WhatsNewContext, "months" | "latestMonthId"> {
  const months = parseWhatsNew(whatsNewRaw)
  return {
    months,
    latestMonthId: latestWhatsNewMonthId(months),
  }
}

export const whatsNewMachine = setup({
  types: {
    context: {} as WhatsNewContext,
    events: {} as WhatsNewEvent,
  },
  actions: {
    loadContent: assign(() => loadMonths()),
    syncAttention: ({ context }) => {
      syncUnreadNotification(context.latestMonthId)
    },
    markViewed: ({ context }) => {
      const monthId = context.latestMonthId
      if (!monthId) return
      markWhatsNewMonthViewed(monthId)
      resolveNotifications([whatsNewMonthNotificationId(monthId)])
    },
    clearAttention: () => {
      reconcileNotifications(WHATS_NEW_SOURCE, [])
    },
  },
}).createMachine({
  id: "whatsNew",
  initial: "idle",
  context: {
    months: [],
    latestMonthId: null,
  },
  states: {
    idle: {
      on: {
        ACTIVATE: {
          target: "active",
          actions: ["loadContent", "syncAttention"],
        },
      },
    },
    active: {
      exit: ["clearAttention"],
      on: {
        DEACTIVATE: "idle",
        MARK_VIEWED: { actions: ["markViewed"] },
        REFRESH: { actions: ["loadContent", "syncAttention"] },
      },
    },
  },
})
