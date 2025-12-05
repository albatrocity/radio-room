/**
 * Playlist Actor
 *
 * Singleton actor that manages playlist state.
 * Active in room, subscribes to socket events for playlist updates.
 */

import { createActor } from "xstate"
import { playlistMachine } from "../machines/playlistMachine"
import { subscribeActor, unsubscribeActor } from "./socketActor"
import { QueueItem } from "../types/Queue"

// ============================================================================
// Actor Instance
// ============================================================================

export const playlistActor = createActor(playlistMachine).start()

// ============================================================================
// Lifecycle
// ============================================================================

let isSubscribed = false

/**
 * Subscribe to socket events. Called when entering a room.
 */
export function subscribePlaylistActor(): void {
  if (!isSubscribed) {
    subscribeActor(playlistActor)
    isSubscribed = true
  }
}

/**
 * Unsubscribe from socket events. Called when leaving a room.
 */
export function unsubscribePlaylistActor(): void {
  if (isSubscribed) {
    unsubscribeActor(playlistActor)
    isSubscribed = false
  }
}

/**
 * Reset playlist state. Called when leaving a room.
 */
export function resetPlaylist(): void {
  playlistActor.send({ type: "PLAYLIST", data: [] })
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Get the current playlist.
 */
export function getPlaylist(): QueueItem[] {
  return playlistActor.getSnapshot().context.playlist
}

/**
 * Check if playlist view is active.
 */
export function isPlaylistActive(): boolean {
  return playlistActor.getSnapshot().matches("active")
}

/**
 * Toggle playlist visibility.
 */
export function togglePlaylist(): void {
  playlistActor.send({ type: "TOGGLE_PLAYLIST" })
}
