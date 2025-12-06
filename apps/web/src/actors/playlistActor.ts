/**
 * Playlist Actor
 *
 * Singleton actor that manages playlist state.
 * Socket subscription is managed internally via the machine's invoke pattern.
 * Send ACTIVATE when entering a room, DEACTIVATE when leaving.
 */

import { createActor } from "xstate"
import { playlistMachine } from "../machines/playlistMachine"
import { QueueItem } from "../types/Queue"

// ============================================================================
// Actor Instance
// ============================================================================

export const playlistActor = createActor(playlistMachine).start()

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
 * Check if playlist view is expanded.
 */
export function isPlaylistExpanded(): boolean {
  return playlistActor.getSnapshot().matches({ active: "expanded" })
}

/**
 * Toggle playlist visibility.
 */
export function togglePlaylist(): void {
  playlistActor.send({ type: "TOGGLE_PLAYLIST" })
}
