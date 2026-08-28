import { matchesModals, type ModalsSnapshot } from "./modalsState"

export type IntegratedPanelSlotId = "gameState" | "adminSettings"

export type IntegratedPanelPresentation = "panel" | "modal"

export const INTEGRATED_PANEL_SLOTS: Record<
  IntegratedPanelSlotId,
  { title: string; supportsPanel: boolean }
> = {
  gameState: { title: "Game", supportsPanel: true },
  adminSettings: { title: "Settings", supportsPanel: true },
}

/** Maps an open `modalsMachine` state to a panel slot, if any. */
export function resolveIntegratedPanelSlot(state: ModalsSnapshot): IntegratedPanelSlotId | null {
  if (matchesModals(state, "gameState")) return "gameState"
  if (matchesModals(state, "settings")) return "adminSettings"
  return null
}

/** Pure helper for tests: active slot only when presentation is panel. */
export function resolveActiveIntegratedPanelSlot(
  state: ModalsSnapshot,
  presentation: IntegratedPanelPresentation,
): IntegratedPanelSlotId | null {
  if (presentation !== "panel") return null
  return resolveIntegratedPanelSlot(state)
}

export type IntegratedPanelOpenEvent = { type: "VIEW_GAME_STATE" } | { type: "EDIT_SETTINGS" }

export function integratedPanelOpenEvent(slotId: IntegratedPanelSlotId): IntegratedPanelOpenEvent {
  return slotId === "gameState" ? { type: "VIEW_GAME_STATE" } : { type: "EDIT_SETTINGS" }
}

export function integratedPanelToggleEvent(
  slotId: IntegratedPanelSlotId,
  activeSlot: IntegratedPanelSlotId | null,
): IntegratedPanelOpenEvent | { type: "CLOSE" } {
  return activeSlot === slotId ? { type: "CLOSE" } : integratedPanelOpenEvent(slotId)
}
