/**
 * Settings Actor
 *
 * Singleton actor that manages room settings state.
 * Active in room, subscribes to socket events for settings updates.
 */

import { createActor } from "xstate"
import { settingsMachine } from "../machines/settingsMachine"
import { subscribeActor, unsubscribeActor } from "./socketActor"
import { Room } from "../types/Room"

// ============================================================================
// Actor Instance
// ============================================================================

export const settingsActor = createActor(settingsMachine).start()

// ============================================================================
// Lifecycle
// ============================================================================

let isSubscribed = false

/**
 * Subscribe to socket events. Called when entering a room.
 */
export function subscribeSettingsActor(): void {
  if (!isSubscribed) {
    subscribeActor(settingsActor)
    isSubscribed = true
  }
}

/**
 * Unsubscribe from socket events. Called when leaving a room.
 */
export function unsubscribeSettingsActor(): void {
  if (isSubscribed) {
    unsubscribeActor(settingsActor)
    isSubscribed = false
  }
}

/**
 * Reset settings state.
 */
export function resetSettings(): void {
  settingsActor.send({ type: "FETCH" })
}

// ============================================================================
// Public API
// ============================================================================

type SettingsContext = ReturnType<typeof settingsActor.getSnapshot>["context"]

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

