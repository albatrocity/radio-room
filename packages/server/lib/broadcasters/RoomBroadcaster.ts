import type { Server } from "socket.io"
import type { SystemEventName, SystemEventPayload } from "@repo/types"
import { SocketBroadcaster } from "./Broadcaster"
import { getRoomPath } from "../getRoomPath"

/**
 * RoomBroadcaster
 *
 * Broadcasts system events to room-specific socket channels.
 * Each room has its own channel (e.g., "room:abc123") and clients
 * in that room receive events relevant to their room.
 *
 * This broadcaster emits ALL events to the room channel, using a
 * standardized "event" message format with { type, data } payload.
 */
export class RoomBroadcaster extends SocketBroadcaster {
  readonly name = "room"

  constructor(io: Server) {
    super(io)
  }

  handleEvent<K extends SystemEventName>(
    roomId: string,
    event: K,
    data: SystemEventPayload<K>,
  ): void {
    // Emit all events to the room channel
    // Clients filter/handle events based on type
    const channel = getRoomPath(roomId)

    this.emit(channel, "event", {
      type: event as string,
      data,
    })
  }
}
