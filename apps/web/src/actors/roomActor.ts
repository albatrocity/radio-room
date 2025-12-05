/**
 * Room Actor
 *
 * Singleton actor that manages room fetch/data state.
 * Active in room route, subscribes to socket events for room updates.
 */

import { interpret } from "xstate"
import { roomFetchMachine, RoomFetchContext } from "../machines/roomFetchMachine"
import { subscribeActor, unsubscribeActor } from "./socketActor"
import { Room } from "../types/Room"

// ============================================================================
// Actor Instance
// ============================================================================

export const roomActor = interpret(roomFetchMachine).start()

// ============================================================================
// Lifecycle
// ============================================================================

let isSubscribed = false

/**
 * Subscribe to socket events. Called when entering a room.
 */
export function subscribeRoomActor(): void {
  if (!isSubscribed) {
    subscribeActor(roomActor)
    isSubscribed = true
  }
}

/**
 * Unsubscribe from socket events. Called when leaving a room.
 */
export function unsubscribeRoomActor(): void {
  if (isSubscribed) {
    unsubscribeActor(roomActor)
    isSubscribed = false
  }
}

/**
 * Reset room state. Called when leaving a room.
 */
export function resetRoom(): void {
  roomActor.send({ type: "RESET" })
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Get the current room.
 */
export function getCurrentRoom(): Omit<Room, "password"> | null {
  return roomActor.getSnapshot().context.room
}

/**
 * Get room error if any.
 */
export function getRoomError(): RoomFetchContext["error"] {
  return roomActor.getSnapshot().context.error
}

/**
 * Check if room has audio (radio type).
 */
export function roomHasAudio(): boolean {
  return roomActor.getSnapshot().context.room?.type === "radio"
}

/**
 * Get room banner/extra info.
 */
export function getRoomBanner(): string | undefined {
  return roomActor.getSnapshot().context.room?.extraInfo
}

/**
 * Get room creator ID.
 */
export function getRoomCreator(): string | undefined {
  return roomActor.getSnapshot().context.room?.creator
}

/**
 * Fetch room data.
 */
export function fetchRoom(id: Room["id"]): void {
  roomActor.send({ type: "FETCH", data: { id } })
}

/**
 * Get latest room data from server.
 */
export function getLatestRoomData(): void {
  roomActor.send({ type: "GET_LATEST_ROOM_DATA" })
}
