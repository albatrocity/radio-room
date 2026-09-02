/**
 * Detects newly offered Game State plugin tabs and TAB_ATTENTION events,
 * then raises notifications on the center (ADR 0144). Does not own pending
 * badge state — that lives on notificationsActor.
 */

import { assign, setup } from "xstate"
import { raiseNotification, resolveNotifications } from "../actors/notificationsActor"
import { pluginTabNotificationId } from "../lib/notificationIds"

const PLUGIN_TAB_SOURCE = "plugin-tab"

function sortIds(ids: string[]): string[] {
  return [...ids].sort((a, b) => a.localeCompare(b))
}

function raisePluginTabAttention(tabId: string): void {
  raiseNotification({
    id: pluginTabNotificationId(tabId),
    source: PLUGIN_TAB_SOURCE,
    target: { surface: "gameState", tabId },
    clearOn: "view",
    persist: true,
  })
}

function resolvePluginTabAttention(tabIds: string[]): void {
  if (tabIds.length === 0) return
  resolveNotifications(tabIds.map(pluginTabNotificationId))
}

export interface GameStateNewPluginTabsMachineContext {
  roomId: string | null
  /**
   * Last observed plugin tab id list (sorted).
   * - `null`: no non-empty sync yet (initial / room change).
   * - `[]`: empty list was observed — next non-empty ids are treated as newly offered.
   */
  previousObservedIds: string[] | null
}

export type GameStateNewPluginTabsEvent =
  | { type: "PLUGIN_TABS_CHANGED"; ids: string[] }
  /** Mark an existing tab as needing attention (e.g. bingo cell covered). */
  | { type: "TAB_ATTENTION"; tabId: string }
  | { type: "ROOM_CHANGED"; roomId: string | null }

export const gameStateNewPluginTabsMachine = setup({
  types: {
    context: {} as GameStateNewPluginTabsMachineContext,
    events: {} as GameStateNewPluginTabsEvent,
    input: {} as { roomId: string | null },
  },
  actions: {
    setRoomAndResetBaseline: assign(({ event }) => {
      if (event.type !== "ROOM_CHANGED") {
        return {}
      }
      return {
        roomId: event.roomId,
        previousObservedIds: null,
      }
    }),
    /**
     * First non-empty tab list while still in baseline.
     * - `previousObservedIds === null`: first sync — record snapshot, do not raise.
     * - `previousObservedIds.length === 0`: we already observed `[]` — raise as newly offered.
     */
    establishFromBaseline: assign(({ context, event }) => {
      if (event.type !== "PLUGIN_TABS_CHANGED") {
        return {}
      }
      const sorted = sortIds(event.ids)
      const prev = context.previousObservedIds

      if (prev === null) {
        return { previousObservedIds: sorted }
      }

      if (prev.length === 0) {
        for (const id of sorted) {
          raisePluginTabAttention(id)
        }
        return { previousObservedIds: sorted }
      }

      return { previousObservedIds: sorted }
    }),
    mergeNewPluginTabs: assign(({ context, event }) => {
      if (event.type !== "PLUGIN_TABS_CHANGED") {
        return {}
      }
      const sorted = sortIds(event.ids)
      const prev = context.previousObservedIds ?? []
      const added = sorted.filter((id) => !prev.includes(id))
      const removed = prev.filter((id) => !sorted.includes(id))
      for (const id of added) {
        raisePluginTabAttention(id)
      }
      resolvePluginTabAttention(removed)
      return { previousObservedIds: sorted }
    }),
    raiseTabAttention: ({ context, event }) => {
      if (event.type !== "TAB_ATTENTION") return
      const tabId = event.tabId
      if (!tabId) return
      // Only badge tabs we have already observed (or will prune if tab disappears).
      const observed = context.previousObservedIds
      if (observed != null && observed.length > 0 && !observed.includes(tabId)) {
        return
      }
      raisePluginTabAttention(tabId)
    },
    pruneToEmpty: assign(({ event }) => {
      if (event.type !== "PLUGIN_TABS_CHANGED") {
        return {}
      }
      // Resolve any notifications for tabs that disappeared with the empty list.
      // We don't know prior ids here beyond previousObservedIds — handled in merge
      // when going non-empty→empty via mergeNewPluginTabs when not empty guard.
      return { previousObservedIds: [] as string[] }
    }),
    resolveAllObserved: ({ context }) => {
      const prev = context.previousObservedIds
      if (prev && prev.length > 0) {
        resolvePluginTabAttention(prev)
      }
    },
  },
  guards: {
    isEmptyPluginTabs: ({ event }) =>
      event.type === "PLUGIN_TABS_CHANGED" && event.ids.length === 0,
    isNonEmptyPluginTabs: ({ event }) =>
      event.type === "PLUGIN_TABS_CHANGED" && event.ids.length > 0,
  },
}).createMachine({
  id: "gameStateNewPluginTabs",
  context: ({ input }) => ({
    roomId: input.roomId,
    previousObservedIds: null,
  }),
  initial: "baseline",
  states: {
    /**
     * Wait until we see a non-empty plugin tab list once so an empty initial payload
     * does not treat every later tab as “new”.
     */
    baseline: {
      on: {
        ROOM_CHANGED: {
          actions: "setRoomAndResetBaseline",
          target: "baseline",
          reenter: true,
        },
        PLUGIN_TABS_CHANGED: [
          {
            guard: "isEmptyPluginTabs",
            actions: ["resolveAllObserved", "pruneToEmpty"],
          },
          {
            guard: "isNonEmptyPluginTabs",
            target: "tracking",
            actions: ["establishFromBaseline"],
          },
        ],
        TAB_ATTENTION: {
          actions: ["raiseTabAttention"],
        },
      },
    },
    tracking: {
      on: {
        ROOM_CHANGED: {
          actions: "setRoomAndResetBaseline",
          target: "baseline",
        },
        PLUGIN_TABS_CHANGED: [
          {
            guard: "isEmptyPluginTabs",
            actions: ["resolveAllObserved", "pruneToEmpty"],
            target: "baseline",
          },
          {
            actions: ["mergeNewPluginTabs"],
          },
        ],
        TAB_ATTENTION: {
          actions: ["raiseTabAttention"],
        },
      },
    },
  },
})
