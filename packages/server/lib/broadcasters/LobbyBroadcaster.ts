import type { Server } from "socket.io"
import type { SystemEventName, SystemEventPayload, QueueItem } from "@repo/types"
import { SocketBroadcaster } from "./Broadcaster"

/**
 * Payload sent to lobby clients when room data changes
 */
export interface LobbyRoomUpdate {
  roomId: string
  userCount?: number
  nowPlaying?: QueueItem | null
}

/**
 * LobbyBroadcaster
 *
 * Broadcasts room updates to the lobby socket channel.
 * Only certain events are relevant to the lobby (track changes, user joins/leaves).
 *
 * The lobby channel is a single channel that all lobby clients join.
 * This allows the public lobby to show real-time updates without
 * subscribing to individual room channels.
 */
export class LobbyBroadcaster extends SocketBroadcaster {
  readonly name = "lobby"

  /** Events that should trigger lobby updates */
  private readonly relevantEvents: SystemEventName[] = ["TRACK_CHANGED", "USER_JOINED", "USER_LEFT"]

  constructor(io: Server) {
    super(io)
  }

  handleEvent<K extends SystemEventName>(
    roomId: string,
    event: K,
    data: SystemEventPayload<K>,
  ): void {
    // Only handle events relevant to the lobby
    if (!this.relevantEvents.includes(event)) {
      return
    }

    const update = this.buildLobbyUpdate(roomId, event, data)
    this.emit("lobby", "LOBBY_ROOM_UPDATE", update)
  }

  /**
   * Build an update payload for lobby clients
   */
  private buildLobbyUpdate<K extends SystemEventName>(
    roomId: string,
    event: K,
    data: SystemEventPayload<K>,
  ): LobbyRoomUpdate {
    const update: LobbyRoomUpdate = { roomId }

    if (event === "USER_JOINED" || event === "USER_LEFT") {
      // Extract user count from the users array in the event data
      const eventData = data as { users?: unknown[] }
      update.userCount = eventData.users?.length ?? 0
    }

    if (event === "TRACK_CHANGED") {
      const eventData = data as { track?: QueueItem }
      update.nowPlaying = eventData.track ?? null
    }

    return update
  }
}
