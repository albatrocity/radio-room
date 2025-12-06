/**
 * Room Actor
 *
 * Singleton actor that manages room fetch/data state.
 * Socket subscription is managed internally via the machine's invoke pattern.
 * Send ACTIVATE when entering a room, DEACTIVATE when leaving.
 */

import { createActor } from "xstate"
import { roomFetchMachine, RoomFetchContext } from "../machines/roomFetchMachine"
import { Room } from "../types/Room"

// ============================================================================
// Actor Instance
// ============================================================================

export const roomActor = createActor(roomFetchMachine).start()

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
