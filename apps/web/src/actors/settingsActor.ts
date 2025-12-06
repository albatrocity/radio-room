/**
 * Settings Actor
 *
 * Singleton actor that manages room settings state.
 * Socket subscription is managed internally via the machine's invoke pattern.
 * Send ACTIVATE when entering a room, DEACTIVATE when leaving.
 */

import { createActor } from "xstate"
import { settingsMachine, SettingsContext } from "../machines/settingsMachine"
import { Room } from "../types/Room"

// ============================================================================
// Actor Instance
// ============================================================================

export const settingsActor = createActor(settingsMachine).start()

// ============================================================================
// Public API
// ============================================================================

/**
 * Get room settings.
 */
export function getSettings(): SettingsContext {
  return settingsActor.getSnapshot().context
}

/**
 * Get room title.
 */
export function getRoomTitle(): string {
  return settingsActor.getSnapshot().context.title
}

/**
 * Get room type.
 */
export function getRoomType(): Room["type"] {
  return settingsActor.getSnapshot().context.type
}

/**
 * Check if deputize on join is enabled.
 */
export function isDeputizeOnJoin(): boolean {
  return settingsActor.getSnapshot().context.deputizeOnJoin
}

/**
 * Get plugin configs.
 */
export function getPluginConfigs(): Record<string, Record<string, unknown>> {
  return settingsActor.getSnapshot().context.pluginConfigs
}

/**
 * Fetch room settings from server.
 */
export function fetchSettings(): void {
  settingsActor.send({ type: "FETCH" })
}
