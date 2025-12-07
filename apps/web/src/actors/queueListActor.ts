/**
 * Queue List Actor
 *
 * Singleton actor that manages the queue display state.
 * Socket subscription is managed internally via the machine's invoke pattern.
 * Send ACTIVATE when entering a room, DEACTIVATE when leaving.
 */

import { createActor } from "xstate"
import { queueListMachine } from "../machines/queueListMachine"
import { QueueItem } from "../types/Queue"

// ============================================================================
// Actor Instance
// ============================================================================

export const queueListActor = createActor(queueListMachine).start()

// ============================================================================
// Public API
// ============================================================================

/**
 * Get the current queue.
 */
export function getQueueList(): QueueItem[] {
  return queueListActor.getSnapshot().context.queue
}

/**
 * Get the queue count.
 */
export function getQueueCount(): number {
  return queueListActor.getSnapshot().context.queue.length
}

/**
 * Check if there are items in the queue.
 */
export function hasQueueItems(): boolean {
  return queueListActor.getSnapshot().context.queue.length > 0
}
