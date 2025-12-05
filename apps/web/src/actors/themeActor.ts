/**
 * Theme Actor
 *
 * Singleton actor that manages theme state.
 * Always active, persists theme selection to session storage.
 */

import { interpret } from "xstate"
import { themeMachine } from "../machines/themeMachine"
import { AppTheme } from "../types/AppTheme"

// ============================================================================
// Actor Instance
// ============================================================================

export const themeActor = interpret(themeMachine).start()

// ============================================================================
// Public API
// ============================================================================

/**
 * Get the current theme ID.
 */
export function getCurrentTheme(): AppTheme["id"] {
  return themeActor.getSnapshot().context.theme
}

/**
 * Set the current theme.
 */
export function setTheme(themeId: AppTheme["id"]): void {
  themeActor.send({ type: "SET_THEME", theme: themeId })
}

