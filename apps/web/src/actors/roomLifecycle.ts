/**
 * Room Lifecycle Management
 *
 * Coordinates actor lifecycle and state persistence when entering and leaving rooms.
 * Uses ACTIVATE/DEACTIVATE events - each actor manages its own socket subscription
 * internally via XState's invoke pattern.
 */

import { authActor } from "./authActor"
import { chatActor } from "./chatActor"
import { playlistActor } from "./playlistActor"
import { queueListActor } from "./queueListActor"
import { usersActor } from "./usersActor"
import { reactionsActor } from "./reactionsActor"
import { settingsActor } from "./settingsActor"
import { roomActor, fetchRoom, getLatestRoomData } from "./roomActor"
import { audioActor } from "./audioActor"
import { djActor } from "./djActor"
import { adminActor } from "./adminActor"
import { metadataSourceAuthActor } from "./metadataSourceAuthActor"

import {
  getPersistedRoomState,
  applyPersistedRoomState,
  startAutoSave,
  stopAutoSave,
  clearPersistedRoomState,
} from "../lib/roomStatePersistence"

// ============================================================================
// State
// ============================================================================

let currentRoomId: string | null = null
let isInitialized = false

// ============================================================================
// Initialize Room
// ============================================================================

/**
 * Initialize room state and subscriptions.
 * Called when entering a room route.
 */
export function initializeRoom(roomId: string): void {
  // Skip if already initialized for this room
  if (isInitialized && currentRoomId === roomId) {
    console.log("[RoomLifecycle] Already initialized for room:", roomId)
    return
  }

  console.log("[RoomLifecycle] Initializing room:", roomId)
  currentRoomId = roomId
  isInitialized = true

  // Check for rehydratable state
  const persisted = getPersistedRoomState(roomId)
  if (persisted) {
    console.log("[RoomLifecycle] Found persisted state, applying...")
    applyPersistedRoomState(persisted)
  }

  // Activate all room actors (they manage their own socket subscriptions)
  roomActor.send({ type: "ACTIVATE" })
  chatActor.send({ type: "ACTIVATE" })
  playlistActor.send({ type: "ACTIVATE" })
  queueListActor.send({ type: "ACTIVATE" })
  usersActor.send({ type: "ACTIVATE" })
  reactionsActor.send({ type: "ACTIVATE" })
  settingsActor.send({ type: "ACTIVATE" })
  audioActor.send({ type: "ACTIVATE" })
  djActor.send({ type: "ACTIVATE" })
  adminActor.send({ type: "ACTIVATE" })
  metadataSourceAuthActor.send({ type: "ACTIVATE" })

  // Start fetching room data
  fetchRoom(roomId)

  // Trigger auth flow
  authActor.send({ type: "SETUP", data: { roomId } })

  // Start auto-saving state
  startAutoSave(roomId)
}

// ============================================================================
// Teardown Room
// ============================================================================

/**
 * Teardown room state and subscriptions.
 * Called when leaving a room route.
 */
export function teardownRoom(): void {
  if (!isInitialized) {
    console.log("[RoomLifecycle] Not initialized, nothing to teardown")
    return
  }

  console.log("[RoomLifecycle] Tearing down room:", currentRoomId)

  // Stop auto-saving (this also does a final persist)
  stopAutoSave()

  // Notify auth of disconnect
  authActor.send({ type: "USER_DISCONNECTED" })

  // Deactivate all room actors (they clean up their own subscriptions and reset state)
  roomActor.send({ type: "DEACTIVATE" })
  chatActor.send({ type: "DEACTIVATE" })
  playlistActor.send({ type: "DEACTIVATE" })
  queueListActor.send({ type: "DEACTIVATE" })
  usersActor.send({ type: "DEACTIVATE" })
  reactionsActor.send({ type: "DEACTIVATE" })
  settingsActor.send({ type: "DEACTIVATE" })
  audioActor.send({ type: "DEACTIVATE" })
  djActor.send({ type: "DEACTIVATE" })
  adminActor.send({ type: "DEACTIVATE" })
  metadataSourceAuthActor.send({ type: "DEACTIVATE" })

  currentRoomId = null
  isInitialized = false
}

// ============================================================================
// Room Change
// ============================================================================

/**
 * Handle room change (navigating from one room to another).
 */
export function changeRoom(newRoomId: string): void {
  if (currentRoomId === newRoomId) {
    console.log("[RoomLifecycle] Same room, no change needed")
    return
  }

  console.log("[RoomLifecycle] Changing room from", currentRoomId, "to", newRoomId)

  // Teardown current room
  teardownRoom()

  // Initialize new room
  initializeRoom(newRoomId)
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Get the current room ID.
 */
export function getCurrentRoomId(): string | null {
  return currentRoomId
}

/**
 * Check if room is initialized.
 */
export function isRoomInitialized(): boolean {
  return isInitialized
}

/**
 * Force clear all room state (for logout, etc).
 */
export function forceCleanup(): void {
  console.log("[RoomLifecycle] Force cleanup")
  teardownRoom()
  clearPersistedRoomState()
}

/**
 * Handle page visibility change.
 * Fetches latest data when returning to visible tab.
 *
 * Note on mobile background behavior:
 * When users switch to another app on mobile, the browser may throttle or suspend
 * JavaScript execution and close the WebSocket connection. This is expected behavior
 * by design to conserve battery and resources. Socket.io will automatically attempt
 * to reconnect when the app regains focus, and the RECONNECTED event will trigger
 * a data sync. This visibility change handler provides an additional sync opportunity
 * for cases where the socket remained connected but the page was backgrounded.
 */
export function handleVisibilityChange(isVisible: boolean): void {
  if (isVisible && isInitialized && currentRoomId) {
    console.log("[RoomLifecycle] Page visible, fetching latest data")
    // Fetch room data via HTTP to ensure we have the latest room settings
    fetchRoom(currentRoomId)
    // Also request incremental updates (messages, playlist) via socket
    // This handles the case where socket stayed connected but page was backgrounded
    getLatestRoomData()
  }
}
