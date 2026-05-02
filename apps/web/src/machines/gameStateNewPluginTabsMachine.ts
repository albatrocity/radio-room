import { assign, setup } from "xstate"

const STORAGE_PREFIX = "gameStateNewPluginTabs:"

function sortIds(ids: string[]): string[] {
  return [...ids].sort((a, b) => a.localeCompare(b))
}

export function loadPendingTabIds(roomId: string | null): string[] {
  if (roomId == null || typeof sessionStorage === "undefined") return []
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + roomId)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []
  } catch {
    return []
  }
}

export function savePendingTabIds(roomId: string | null, ids: string[]): void {
  if (roomId == null || typeof sessionStorage === "undefined") return
  sessionStorage.setItem(STORAGE_PREFIX + roomId, JSON.stringify(sortIds(ids)))
}

export interface GameStateNewPluginTabsMachineContext {
  roomId: string | null
  pendingIds: string[]
  /**
   * Last observed plugin tab id list (sorted).
   * - `null`: no non-empty sync yet (initial / room change).
   * - `[]`: empty list was observed — next non-empty ids are treated as newly offered.
   */
  previousObservedIds: string[] | null
}

export type GameStateNewPluginTabsEvent =
  | { type: "PLUGIN_TABS_CHANGED"; ids: string[] }
  | { type: "TAB_VIEWED"; tabId: string }
  | { type: "ROOM_CHANGED"; roomId: string | null }

export const gameStateNewPluginTabsMachine = setup({
  types: {
    context: {} as GameStateNewPluginTabsMachineContext,
    events: {} as GameStateNewPluginTabsEvent,
    input: {} as { roomId: string | null },
  },
  actions: {
    persistPending: ({ context }) => {
      savePendingTabIds(context.roomId, context.pendingIds)
    },
    setRoomAndResetBaseline: assign(({ event }) => {
      if (event.type !== "ROOM_CHANGED") {
        return {}
      }
      const roomId = event.roomId
      return {
        roomId,
        pendingIds: loadPendingTabIds(roomId),
        previousObservedIds: null,
      }
    }),
    /**
     * First non-empty tab list while still in baseline.
     * - `previousObservedIds === null`: first sync (e.g. room opened with tabs already on) — record snapshot, do not add pending.
     * - `previousObservedIds.length === 0`: we already observed `[]` — treat current ids as newly offered (e.g. sale just enabled).
     */
    establishFromBaseline: assign(({ context, event }) => {
      if (event.type !== "PLUGIN_TABS_CHANGED") {
        return {}
      }
      const sorted = sortIds(event.ids)
      const pendingPruned = context.pendingIds.filter((id) => sorted.includes(id))
      const prev = context.previousObservedIds

      if (prev === null) {
        return {
          previousObservedIds: sorted,
          pendingIds: pendingPruned,
        }
      }

      if (prev.length === 0) {
        const added = sorted
        const nextPending = sortIds([...new Set([...pendingPruned, ...added])])
        return {
          previousObservedIds: sorted,
          pendingIds: nextPending,
        }
      }

      return {
        previousObservedIds: sorted,
        pendingIds: pendingPruned,
      }
    }),
    mergeNewPluginTabs: assign(({ context, event }) => {
      if (event.type !== "PLUGIN_TABS_CHANGED") {
        return {}
      }
      const sorted = sortIds(event.ids)
      const prev = context.previousObservedIds ?? []
      const added = sorted.filter((id) => !prev.includes(id))
      const pruned = context.pendingIds.filter((id) => sorted.includes(id))
      const nextPending = sortIds([...new Set([...pruned, ...added])])
      return {
        previousObservedIds: sorted,
        pendingIds: nextPending,
      }
    }),
    removePendingTab: assign(({ context, event }) => {
      if (event.type !== "TAB_VIEWED") {
        return {}
      }
      return {
        pendingIds: context.pendingIds.filter((id) => id !== event.tabId),
      }
    }),
    /** Baseline must handle empty updates — otherwise PLUGIN_TABS_CHANGED [] is dropped and stale pending persists. */
    prunePendingToObservedTabs: assign(({ context, event }) => {
      if (event.type !== "PLUGIN_TABS_CHANGED") {
        return {}
      }
      const sorted = sortIds(event.ids)
      return {
        pendingIds: context.pendingIds.filter((id) => sorted.includes(id)),
        /** Empty snapshot seen — next non-empty list is treated as newly offered tabs. */
        previousObservedIds: [],
      }
    }),
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
    pendingIds: loadPendingTabIds(input.roomId),
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
            actions: ["prunePendingToObservedTabs", "persistPending"],
          },
          {
            guard: "isNonEmptyPluginTabs",
            target: "tracking",
            actions: ["establishFromBaseline", "persistPending"],
          },
        ],
      },
    },
    tracking: {
      on: {
        ROOM_CHANGED: {
          actions: "setRoomAndResetBaseline",
          target: "baseline",
        },
        PLUGIN_TABS_CHANGED: {
          actions: ["mergeNewPluginTabs", "persistPending"],
        },
        TAB_VIEWED: {
          actions: ["removePendingTab", "persistPending"],
        },
      },
    },
  },
})
