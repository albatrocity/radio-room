import type { Server } from "socket.io"
import type { SystemEventName, SystemEventPayload, QueueItem, Room } from "@repo/types"
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
 * Payload sent when a room becomes visible in the lobby
 */
export interface LobbyRoomAdded {
  roomId: string
  title: string
  type: Room["type"]
  creator: string
  artwork?: string
  passwordRequired?: boolean
}

/**
 * LobbyBroadcaster
 *
 * Broadcasts room updates to the lobby socket channel.
 * Only certain events are relevant to the lobby (track changes, user joins/leaves,
 * and room settings changes that affect visibility).
 *
 * The lobby channel is a single channel that all lobby clients join.
 * This allows the public lobby to show real-time updates without
 * subscribing to individual room channels.
 */
export class LobbyBroadcaster extends SocketBroadcaster {
  readonly name = "lobby"

  /** Events that should trigger lobby updates */
  private readonly relevantEvents: SystemEventName[] = [
    "TRACK_CHANGED",
    "USER_JOINED",
    "USER_LEFT",
    "ROOM_SETTINGS_UPDATED",
  ]

  constructor(io: Server) {
    super(io)
  }

  handleEvent<K extends SystemEventName>(
    roomId: string,
    event: K,
    data: SystemEventPayload<K>,
  ): void {
    if (!this.relevantEvents.includes(event)) {
      return
    }

    if (event === "ROOM_SETTINGS_UPDATED") {
      this.handleRoomSettingsUpdated(roomId, data)
      return
    }

    const update = this.buildLobbyUpdate(roomId, event, data)
    this.emit("lobby", "LOBBY_ROOM_UPDATE", update)
  }

  private handleRoomSettingsUpdated<K extends SystemEventName>(
    roomId: string,
    data: SystemEventPayload<K>,
  ): void {
    const eventData = data as { room?: Room }
    const room = eventData.room
    if (!room) return

    if (room.public === false) {
      this.emit("lobby", "LOBBY_ROOM_REMOVED", { roomId })
    } else {
      const added: LobbyRoomAdded = {
        roomId,
        title: room.title,
        type: room.type,
        creator: room.creator,
        artwork: room.artwork,
        passwordRequired: room.passwordRequired,
      }
      this.emit("lobby", "LOBBY_ROOM_ADDED", added)
    }
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
