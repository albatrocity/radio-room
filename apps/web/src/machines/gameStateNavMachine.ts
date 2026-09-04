/**
 * Game State modal navigation (ADR 0104, superseded in part by ADR 0106 / 0130).
 *
 * Owns the active tab and a per-tab stack of item detail frames, including
 * frames opened from outside the modal. Overlay open/close is ACTIVATE /
 * DEACTIVATE from `modalsMachine` `gameState` entry/exit (ADR 0130). Detail
 * views play track previews, so leaving a detail frame must stop preview
 * audio — that rule lives on the `detail` state here instead of in each
 * component that happens to trigger the transition.
 */

import { assign, not, setup } from "xstate"
import type { TradeSession } from "@repo/types"

import { stopTrackPreview } from "../actors/trackPreviewActor"
import { TRADES_GIFTS_TAB } from "../constants/gameStateTabs"
import { syncGameStateChildActors } from "../lib/gameStateNavEffects"
import type { GameStateDetailFrame } from "../types/GameStateDetail"

export const GAME_STATE_DEFAULT_TAB = "inventory"

type TabStack = GameStateDetailFrame[]

export interface GameStateNavContext {
  activeTabId: string
  /** Detail frames per tab; empty or missing means that tab shows its index. */
  stacks: Record<string, TabStack>
  /** Null until the surface reports which tabs exist; snap is skipped until then. */
  availableTabIds: string[] | null
  allowTrading: boolean
  activeTrade: TradeSession | null
}

export type GameStateNavEvent =
  /** Game State overlay opened (`modalsMachine` gameState entry). */
  | { type: "ACTIVATE" }
  /** Overlay closed. Frames are kept so the exit animation is not interrupted. */
  | { type: "DEACTIVATE" }
  /** Room left: drop everything, since frames belong to that room's game state. */
  | { type: "RESET" }
  /** Tab picked from the tab bar; returns that tab to its root view. */
  | { type: "SET_ACTIVE_TAB"; tabId: string }
  /** Drill into a detail frame on the tab already being viewed. */
  | { type: "PUSH_DETAIL"; frame: GameStateDetailFrame }
  /** Deep-link: select `tabId` and show `frame` as its only detail frame. */
  | { type: "OPEN_DETAIL_ON_TAB"; tabId: string; frame: GameStateDetailFrame }
  | { type: "POP_TO_INDEX" }
  /** Held inventory stack gone (converted, sold, gifted, traded away). */
  | { type: "DROP_INVENTORY_DETAIL"; itemId: string }
  /** Drop inventory item frames whose `inventoryItemId` is no longer held. */
  | { type: "RECONCILE_INVENTORY_DETAILS"; heldItemIds: string[] }
  /** Finished trade: drop the session frame; `goToInventory` when the viewer is on it (ADR 0131). */
  | { type: "TRADE_SESSION_COMPLETED"; goToInventory: boolean }
  | { type: "SET_AVAILABLE_TABS"; tabIds: string[] }
  | { type: "SESSION_SNAPSHOT"; allowTrading: boolean; activeTrade: TradeSession | null }

const emptyContext = (): GameStateNavContext => ({
  activeTabId: GAME_STATE_DEFAULT_TAB,
  stacks: {},
  availableTabIds: null,
  allowTrading: false,
  activeTrade: null,
})

export function activeStack(context: GameStateNavContext): TabStack {
  return context.stacks[context.activeTabId] ?? []
}

export function currentDetailFrame(context: GameStateNavContext): GameStateDetailFrame | null {
  const stack = activeStack(context)
  return stack.length > 0 ? (stack[stack.length - 1] ?? null) : null
}

function dropInventoryItemFrames(
  stacks: Record<string, TabStack>,
  shouldDrop: (frame: GameStateDetailFrame) => boolean,
): Record<string, TabStack> {
  const next: Record<string, TabStack> = { ...stacks }
  for (const [tabId, stack] of Object.entries(next)) {
    const filtered = stack.filter((frame) => !shouldDrop(frame))
    if (filtered.length !== stack.length) {
      next[tabId] = filtered
    }
  }
  return next
}

function tabMissingFrom(tabId: string, tabIds: string[] | null): boolean {
  if (tabIds == null) return false
  if (tabId === GAME_STATE_DEFAULT_TAB) return false
  return !tabIds.includes(tabId)
}

function syncChildren(
  context: GameStateNavContext,
  navActive: boolean,
  overrides?: { tabId?: string; frame?: GameStateDetailFrame | null },
): void {
  const tabId = overrides?.tabId ?? context.activeTabId
  const frame = overrides?.frame !== undefined ? overrides.frame : currentDetailFrame(context)
  try {
    syncGameStateChildActors({
      navActive,
      tabId,
      frame,
      allowTrading: context.allowTrading,
      activeTrade: context.activeTrade,
    })
  } catch (err) {
    console.error("[gameStateNav] child-actor sync failed", err)
  }
}

export const gameStateNavMachine = setup({
  types: {
    context: {} as GameStateNavContext,
    events: {} as GameStateNavEvent,
  },
  actions: {
    stopPreview: () => {
      stopTrackPreview()
    },
    setActiveTab: assign(({ context, event }) => {
      if (event.type !== "SET_ACTIVE_TAB") return {}
      return {
        activeTabId: event.tabId,
        // Picking a tab lands on its root, including re-picking the tab already
        // being viewed from inside one of its detail frames.
        stacks: { ...context.stacks, [event.tabId]: [] },
      }
    }),
    pushDetail: assign(({ context, event }) => {
      if (event.type !== "PUSH_DETAIL") return {}
      return {
        stacks: {
          ...context.stacks,
          [context.activeTabId]: [...activeStack(context), event.frame],
        },
      }
    }),
    openDetailOnTab: assign(({ context, event }) => {
      if (event.type !== "OPEN_DETAIL_ON_TAB") return {}
      return {
        activeTabId: event.tabId,
        stacks: { ...context.stacks, [event.tabId]: [event.frame] },
      }
    }),
    popToIndex: assign(({ context }) => ({
      stacks: { ...context.stacks, [context.activeTabId]: [] },
    })),
    dropInventoryDetail: assign(({ context, event }) => {
      if (event.type !== "DROP_INVENTORY_DETAIL") return {}
      return {
        stacks: dropInventoryItemFrames(
          context.stacks,
          (frame) => frame.kind === "item" && frame.inventoryItemId === event.itemId,
        ),
      }
    }),
    reconcileInventoryDetails: assign(({ context, event }) => {
      if (event.type !== "RECONCILE_INVENTORY_DETAILS") return {}
      const held = new Set(event.heldItemIds)
      return {
        stacks: dropInventoryItemFrames(
          context.stacks,
          (frame) =>
            frame.kind === "item" &&
            frame.inventoryItemId != null &&
            !held.has(frame.inventoryItemId),
        ),
      }
    }),
    finishTradeSession: assign(({ context, event }) => {
      if (event.type !== "TRADE_SESSION_COMPLETED") return {}
      const stacks = { ...context.stacks, [TRADES_GIFTS_TAB]: [] }
      if (!event.goToInventory) return { stacks }
      return {
        activeTabId: GAME_STATE_DEFAULT_TAB,
        stacks: { ...stacks, [GAME_STATE_DEFAULT_TAB]: [] },
      }
    }),
    setAvailableTabs: assign(({ event }) => {
      if (event.type !== "SET_AVAILABLE_TABS") return {}
      return { availableTabIds: event.tabIds }
    }),
    assignSessionSnapshot: assign(({ event }) => {
      if (event.type !== "SESSION_SNAPSHOT") return {}
      return { allowTrading: event.allowTrading, activeTrade: event.activeTrade }
    }),
    snapToInventory: assign(({ context }) => ({
      activeTabId: GAME_STATE_DEFAULT_TAB,
      stacks: { ...context.stacks, [GAME_STATE_DEFAULT_TAB]: [] },
    })),
    snapIfUnavailable: assign(({ context }) => {
      if (!tabMissingFrom(context.activeTabId, context.availableTabIds)) return {}
      return {
        activeTabId: GAME_STATE_DEFAULT_TAB,
        stacks: { ...context.stacks, [GAME_STATE_DEFAULT_TAB]: [] },
      }
    }),
    resetContext: assign(() => emptyContext()),
    syncChildrenActive: ({ context }) => {
      if (tabMissingFrom(context.activeTabId, context.availableTabIds)) {
        syncChildren(context, true, { tabId: GAME_STATE_DEFAULT_TAB, frame: null })
        return
      }
      syncChildren(context, true)
    },
    syncChildrenAfterTab: ({ context, event }) => {
      if (event.type !== "SET_ACTIVE_TAB") return
      syncChildren(context, true, { tabId: event.tabId, frame: null })
    },
    syncChildrenAfterFinishTrade: ({ context, event, self }) => {
      if (event.type !== "TRADE_SESSION_COMPLETED") return
      if (!self.getSnapshot().matches("active")) return
      if (event.goToInventory) {
        syncChildren(context, true, { tabId: GAME_STATE_DEFAULT_TAB, frame: null })
        return
      }
      const frame =
        context.activeTabId === TRADES_GIFTS_TAB ? null : currentDetailFrame(context)
      syncChildren(context, true, { frame })
    },
    syncChildrenAfterPush: ({ context, event }) => {
      if (event.type !== "PUSH_DETAIL") return
      syncChildren(context, true, { frame: event.frame })
    },
    syncChildrenAfterOpenDetail: ({ context, event, self }) => {
      if (event.type !== "OPEN_DETAIL_ON_TAB") return
      if (!self.getSnapshot().matches("active")) return
      syncChildren(context, true, { tabId: event.tabId, frame: event.frame })
    },
    syncChildrenAfterSnap: ({ context, self }) => {
      if (!self.getSnapshot().matches("active")) return
      syncChildren(context, true, { tabId: GAME_STATE_DEFAULT_TAB, frame: null })
    },
    syncChildrenIfActive: ({ context, event, self }) => {
      if (!self.getSnapshot().matches("active")) return
      const allowTrading =
        event.type === "SESSION_SNAPSHOT" ? event.allowTrading : context.allowTrading
      const activeTrade =
        event.type === "SESSION_SNAPSHOT" ? event.activeTrade : context.activeTrade
      try {
        syncGameStateChildActors({
          navActive: true,
          tabId: context.activeTabId,
          frame: currentDetailFrame(context),
          allowTrading,
          activeTrade,
        })
      } catch (err) {
        console.error("[gameStateNav] child-actor sync failed", err)
      }
    },
    deactivateChildren: ({ context }) => {
      syncChildren(context, false)
    },
    /** Drop the list on close so ACTIVATE cannot snap using a stale set (e.g. trading
     * enabled after a prior open, or Accept-toast deep-link before the surface reports). */
    clearAvailableTabs: assign({
      availableTabIds: () => null as string[] | null,
    }),
  },
  guards: {
    hasDetailFrame: ({ context }) => activeStack(context).length > 0,
    /** Uses the incoming list so the guard is true before `setAvailableTabs` assigns. */
    incomingTabsOmitCurrent: ({ context, event }) =>
      event.type === "SET_AVAILABLE_TABS" &&
      tabMissingFrom(context.activeTabId, event.tabIds),
  },
}).createMachine({
  id: "gameStateNav",
  context: emptyContext(),
  initial: "inactive",
  on: {
    // Deep-link tab/frame before the modal opens; rendered on ACTIVATE.
    SET_ACTIVE_TAB: {
      actions: "setActiveTab",
    },
    TRADE_SESSION_COMPLETED: {
      actions: ["stopPreview", "finishTradeSession"],
    },
    OPEN_DETAIL_ON_TAB: {
      actions: ["stopPreview", "openDetailOnTab", "syncChildrenAfterOpenDetail"],
    },
    DROP_INVENTORY_DETAIL: {
      actions: ["dropInventoryDetail", "syncChildrenIfActive"],
    },
    RECONCILE_INVENTORY_DETAILS: {
      actions: ["reconcileInventoryDetails", "syncChildrenIfActive"],
    },
    SET_AVAILABLE_TABS: [
      {
        guard: "incomingTabsOmitCurrent",
        actions: ["setAvailableTabs", "snapToInventory", "syncChildrenAfterSnap"],
      },
      { actions: "setAvailableTabs" },
    ],
    SESSION_SNAPSHOT: {
      actions: ["assignSessionSnapshot", "syncChildrenIfActive"],
    },
    RESET: {
      target: ".inactive",
      actions: ["deactivateChildren", "resetContext"],
    },
  },
  states: {
    inactive: {
      on: {
        ACTIVATE: "active",
      },
    },
    active: {
      entry: ["snapIfUnavailable", "syncChildrenActive"],
      exit: ["deactivateChildren", "clearAvailableTabs"],
      initial: "index",
      on: {
        // Leaves the frame in place: clearing it here would swap the modal back
        // to the tab index while it is still animating out. Reopening resumes
        // the detail view, the way the selected tab already persists.
        DEACTIVATE: "inactive",
        SET_ACTIVE_TAB: {
          actions: ["setActiveTab", "syncChildrenAfterTab"],
        },
        TRADE_SESSION_COMPLETED: {
          actions: ["stopPreview", "finishTradeSession", "syncChildrenAfterFinishTrade"],
        },
        // Detail-to-detail keeps the state, so the exit action below never runs.
        PUSH_DETAIL: {
          actions: ["stopPreview", "pushDetail", "syncChildrenAfterPush"],
        },
        POP_TO_INDEX: {
          actions: "popToIndex",
        },
      },
      states: {
        index: {
          always: {
            target: "detail",
            guard: "hasDetailFrame",
          },
        },
        detail: {
          exit: "stopPreview",
          always: {
            target: "index",
            guard: not("hasDetailFrame"),
          },
        },
      },
    },
  },
})
