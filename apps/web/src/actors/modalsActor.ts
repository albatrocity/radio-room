/**
 * Modals Actor
 *
 * Singleton actor that manages modal/dialog state.
 * Always active, controls which modal is currently open.
 */

import { createActor } from "xstate"
import { modalsMachine, Event as ModalsEvent } from "../machines/modalsMachine"
import { GAME_STATE_DEFAULT_TAB } from "../machines/gameStateNavMachine"
import { TRADES_GIFTS_TAB } from "../constants/gameStateTabs"
import type { GameStateDetailFrame } from "../types/GameStateDetail"
import { gameStateNavActor } from "./gameStateNavActor"
import { isModalsIdle, matchesModals } from "../lib/modalsState"

export { TRADES_GIFTS_TAB }

// ============================================================================
// Actor Instance
// ============================================================================

export const modalsActor = createActor(modalsMachine).start()

// ============================================================================
// Public API
// ============================================================================

/**
 * Check if a specific modal is currently open.
 */
export function isModalOpen(modalName: string): boolean {
  return matchesModals(modalsActor.getSnapshot(), modalName)
}

/**
 * Check if any modal is currently open.
 */
export function isAnyModalOpen(): boolean {
  return !isModalsIdle(modalsActor.getSnapshot())
}

/**
 * Get current modal state value.
 */
export function getCurrentModal(): string {
  const state = modalsActor.getSnapshot()
  if (typeof state.value === "string") {
    return state.value
  }
  // Handle nested states (like settings.overview)
  return JSON.stringify(state.value)
}

/**
 * Send an event to the modals actor.
 */
export function sendModalsEvent(event: ModalsEvent): void {
  modalsActor.send(event)
}

/**
 * Close the currently open modal.
 */
export function closeModal(): void {
  const snapshot = modalsActor.getSnapshot()
  if (matchesModals(snapshot, "help")) {
    modalsActor.send({ type: "CLOSE_HELP" })
    return
  }
  if (matchesModals(snapshot, "feedback")) {
    modalsActor.send({ type: "CLOSE_FEEDBACK" })
    return
  }
  if (matchesModals(snapshot, "queue")) {
    modalsActor.send({ type: "CLOSE_QUEUE" })
    return
  }
  modalsActor.send({ type: "CLOSE" })
}

export function openGameStateOnTab(params: {
  tabId?: string
  frame?: GameStateDetailFrame
}): void {
  const tabId = params.tabId?.trim() || GAME_STATE_DEFAULT_TAB
  if (params.frame) {
    gameStateNavActor.send({
      type: "OPEN_DETAIL_ON_TAB",
      tabId,
      frame: params.frame,
    })
  } else {
    gameStateNavActor.send({ type: "SET_ACTIVE_TAB", tabId })
  }
  modalsActor.send({ type: "VIEW_GAME_STATE" })
}

/** Drop the finished trade frame; switch to Inventory only if already viewing it (ADR 0131). */
export function onTradeSessionCompleted(goToInventory: boolean): void {
  gameStateNavActor.send({ type: "TRADE_SESSION_COMPLETED", goToInventory })
}

/**
 * Open Game State on an item detail frame (ADR 0104/0106).
 *
 * The frame goes to the nav actor first so it is already in place when the
 * modal mounts.
 */
export function openGameStateItemDetail(params: {
  tabId?: string
  frame: GameStateDetailFrame
}): void {
  openGameStateOnTab({
    tabId: params.tabId?.trim() || GAME_STATE_DEFAULT_TAB,
    frame: params.frame,
  })
}
