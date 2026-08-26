/**
 * Room Layout Actor
 *
 * Global desktop column width preferences for the lg+ Splitter layout.
 * Persisted to localStorage.
 */

import { createActor } from "xstate"

import { roomLayoutMachine } from "../machines/roomLayoutMachine"
import type { RoomLayoutKey } from "../lib/roomLayoutStorage"

export const roomLayoutActor = createActor(roomLayoutMachine).start()

export function sendRoomLayoutEvent(
  event: Parameters<typeof roomLayoutActor.send>[0],
): void {
  roomLayoutActor.send(event)
}

export function resetRoomLayout(layout?: RoomLayoutKey): void {
  roomLayoutActor.send({ type: "RESET", layout })
}
