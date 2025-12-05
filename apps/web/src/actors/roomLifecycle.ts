/**
 * Room Lifecycle Management
 *
 * Coordinates actor subscriptions, state persistence, and cleanup
 * when entering and leaving rooms.
 */

import { authActor } from "./authActor"
import { subscribeChatActor, unsubscribeChatActor, resetChat } from "./chatActor"
import { subscribePlaylistActor, unsubscribePlaylistActor, resetPlaylist } from "./playlistActor"
import { subscribeUsersActor, unsubscribeUsersActor, resetUsers } from "./usersActor"
import { subscribeReactionsActor, unsubscribeReactionsActor, resetReactions } from "./reactionsActor"
import { subscribeSettingsActor, unsubscribeSettingsActor } from "./settingsActor"
import { subscribeRoomActor, unsubscribeRoomActor, resetRoom, fetchRoom } from "./roomActor"
import { subscribeAudioActor, unsubscribeAudioActor } from "./audioActor"
import { subscribeDjActor, unsubscribeDjActor } from "./djActor"
import { subscribeAdminActor, unsubscribeAdminActor } from "./adminActor"
import { subscribeMetadataSourceAuthActor, unsubscribeMetadataSourceAuthActor } from "./metadataSourceAuthActor"

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

  // Subscribe all room actors to socket
  subscribeRoomActor()
  subscribeChatActor()
  subscribePlaylistActor()
  subscribeUsersActor()
  subscribeReactionsActor()
  subscribeSettingsActor()
  subscribeAudioActor()
  subscribeDjActor()
  subscribeAdminActor()
  subscribeMetadataSourceAuthActor()

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

  // Unsubscribe all room actors from socket
  unsubscribeRoomActor()
  unsubscribeChatActor()
  unsubscribePlaylistActor()
  unsubscribeUsersActor()
  unsubscribeReactionsActor()
  unsubscribeSettingsActor()
  unsubscribeAudioActor()
  unsubscribeDjActor()
  unsubscribeAdminActor()
  unsubscribeMetadataSourceAuthActor()

  // Reset room actor states
  resetRoom()
  resetChat()
  resetPlaylist()
  resetUsers()
  resetReactions()

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
 */
export function handleVisibilityChange(isVisible: boolean): void {
  if (isVisible && isInitialized && currentRoomId) {
    console.log("[RoomLifecycle] Page visible, fetching latest data")
    // Room actor will emit GET_LATEST_ROOM_DATA
    fetchRoom(currentRoomId)
  }
}

