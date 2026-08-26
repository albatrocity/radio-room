/**
 * Game State modal navigation (ADR 0104, superseded in part by ADR 0106).
 *
 * Owns the active tab and a per-tab stack of item detail frames, including
 * frames opened from outside the modal. Detail views play track previews, so
 * leaving a detail frame must stop preview audio — that rule lives on the
 * `detail` state here instead of in each component that happens to trigger the
 * transition.
 */

import { assign, not, setup } from "xstate"

import { stopTrackPreview } from "../actors/trackPreviewActor"
import type { GameStateDetailFrame } from "../types/GameStateDetail"

export const GAME_STATE_DEFAULT_TAB = "inventory"

type TabStack = GameStateDetailFrame[]

export interface GameStateNavContext {
  activeTabId: string
  /** Detail frames per tab; empty or missing means that tab shows its index. */
  stacks: Record<string, TabStack>
}

export type GameStateNavEvent =
  /** Game State modal opened. */
  | { type: "ACTIVATE" }
  /** Modal closed. Frames are kept so the exit animation is not interrupted. */
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

const emptyContext = (): GameStateNavContext => ({
  activeTabId: GAME_STATE_DEFAULT_TAB,
  stacks: {},
})

export function activeStack(context: GameStateNavContext): TabStack {
  return context.stacks[context.activeTabId] ?? []
}

export function currentDetailFrame(context: GameStateNavContext): GameStateDetailFrame | null {
  const stack = activeStack(context)
  return stack.length > 0 ? (stack[stack.length - 1] ?? null) : null
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
    resetContext: assign(() => emptyContext()),
  },
  guards: {
    hasDetailFrame: ({ context }) => activeStack(context).length > 0,
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
    OPEN_DETAIL_ON_TAB: {
      actions: ["stopPreview", "openDetailOnTab"],
    },
    RESET: {
      target: ".inactive",
      actions: "resetContext",
    },
  },
  states: {
    inactive: {
      on: {
        ACTIVATE: "active",
      },
    },
    active: {
      initial: "index",
      on: {
        // Leaves the frame in place: clearing it here would swap the modal back
        // to the tab index while it is still animating out. Reopening resumes
        // the detail view, the way the selected tab already persists.
        DEACTIVATE: "inactive",
        SET_ACTIVE_TAB: {
          actions: "setActiveTab",
        },
        // Detail-to-detail keeps the state, so the exit action below never runs.
        PUSH_DETAIL: {
          actions: ["stopPreview", "pushDetail"],
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
