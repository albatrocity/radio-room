import type { Server } from "socket.io"
import type {
  SystemEventName,
  SystemEventPayload,
  QueueItem,
  Room,
  AppContext,
} from "@repo/types"
import { SocketBroadcaster } from "./Broadcaster"
import { getRoomCurrent, getRoomOnlineUsers } from "../../operations/data"

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
  /** Current track so lobby clients can show artwork / drive dynamic theme */
  nowPlaying?: QueueItem | null
  userCount?: number
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

  constructor(
    io: Server,
    private readonly context: AppContext,
  ) {
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
      // Enrich with nowPlaying so lobby artwork + dynamic theme update immediately
      void this.emitRoomAdded(roomId, room)
    }
  }

  private async emitRoomAdded(roomId: string, room: Room): Promise<void> {
    let nowPlaying: QueueItem | null = null
    let userCount = 0

    try {
      const [currentMeta, onlineUsers] = await Promise.all([
        getRoomCurrent({ context: this.context, roomId }),
        getRoomOnlineUsers({ context: this.context, roomId }),
      ])
      nowPlaying = currentMeta?.nowPlaying ?? null
      userCount = onlineUsers?.length ?? 0
    } catch (error) {
      console.error(`[${this.name}] Failed to enrich LOBBY_ROOM_ADDED:`, error)
    }

    const added: LobbyRoomAdded = {
      roomId,
      title: room.title,
      type: room.type,
      creator: room.creator,
      artwork: room.artwork,
      passwordRequired: room.passwordRequired,
      nowPlaying,
      userCount,
    }
    this.emit("lobby", "LOBBY_ROOM_ADDED", added)
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
