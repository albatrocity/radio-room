/**
 * System Event Types
 *
 * These are the canonical event definitions used across all layers:
 * - SystemEvents (emission)
 * - Plugin System (in-process handlers)
 * - Redis PubSub (cross-server communication)
 * - Socket.IO (frontend real-time updates)
 *
 * Event naming convention: SCREAMING_SNAKE_CASE
 * Channel format for Redis: SYSTEM:{EVENT_NAME}
 */

import type { Room, RoomMeta } from "./Room"
import type { QueueItem } from "./Queue"
import type { ReactionPayload, ReactionStore } from "./Reaction"
import type { User } from "./User"
import type { ChatMessage } from "./ChatMessage"
import type { MetadataSourceTrack } from "./MetadataSource"
import type { MetadataSourceType } from "./TrackSource"
import type { RoomScheduleSnapshotDTO } from "./Scheduling"
import type {
  GameSessionConfig,
  GameSessionResults,
  GameStateChange,
  GameStateModifier,
} from "./GameSession"
import type {
  InventoryAcquisitionSource,
  InventoryItem,
  ItemUseResult,
} from "./Inventory"

/**
 * System event handler signatures
 *
 * Each event maps to a handler function that receives the event payload.
 * Handlers can be sync or async.
 */
export type SystemEventHandlers = {
  // Track/Media events
  TRACK_CHANGED: (data: {
    roomId: string
    track: QueueItem
    meta?: RoomMeta
  }) => Promise<void> | void

  MEDIA_SOURCE_STATUS_CHANGED: (data: {
    roomId: string
    status: "online" | "offline" | "connecting" | "error"
    sourceType?: "jukebox" | "radio" | "live"
    /** Which listen path this status refers to (hybrid radio + experimental WebRTC). */
    streamTransport?: "shoutcast" | "webrtc"
    bitrate?: number
    error?: string
  }) => Promise<void> | void

  PLAYLIST_TRACK_ADDED: (data: { roomId: string; track: QueueItem }) => Promise<void> | void

  PLAYLIST_TRACK_UPDATED: (data: { roomId: string; track: QueueItem }) => Promise<void> | void

  PLAYLIST_TRACK_DELETED: (data: {
    roomId: string
    playedAt: number // Unique identifier for the track (sorted set score)
  }) => Promise<void> | void

  // Queue events
  QUEUE_CHANGED: (data: { roomId: string; queue: QueueItem[] }) => Promise<void> | void

  // Event for when additional metadata arrives for an existing track (from secondary MetadataSources)
  TRACK_METADATA_UPDATED: (data: {
    roomId: string
    trackKey: string // mediaSource identifier (e.g., "spotify:trackId")
    metadataSourceType: MetadataSourceType
    track: MetadataSourceTrack
  }) => Promise<void> | void

  // Reaction events
  REACTION_ADDED: (data: {
    roomId: string
    reaction: ReactionPayload
    reactions?: ReactionStore
  }) => Promise<void> | void

  REACTION_REMOVED: (data: {
    roomId: string
    reaction: ReactionPayload
    reactions?: ReactionStore
  }) => Promise<void> | void

  // User events
  USER_JOINED: (data: { roomId: string; user: User; users?: User[] }) => Promise<void> | void

  USER_LEFT: (data: { roomId: string; user: User; users?: User[] }) => Promise<void> | void

  USER_STATUS_CHANGED: (data: {
    roomId: string
    user: User
    oldStatus?: string
  }) => Promise<void> | void

  USER_KICKED: (data: { roomId: string; user: User; reason?: string }) => Promise<void> | void

  // Room events
  ROOM_DELETED: (data: { roomId: string }) => Promise<void> | void

  ROOM_SETTINGS_UPDATED: (data: {
    roomId: string
    room: Room
    pluginConfigs?: Record<string, unknown>
  }) => Promise<void> | void

  /** Fired when a room admin activates a segment on the attached show (Redis pub/sub + sockets). */
  SEGMENT_ACTIVATED: (data: {
    roomId: string
    showId: string
    segmentId: string
    segmentTitle: string
  }) => Promise<void> | void

  /** Fired when a segment bulk-deputizes or bulk-dedeputizes all users in the room. */
  DEPUTY_BULK_APPLIED: (data: {
    roomId: string
    action: "deputize_all" | "dedeputize_all"
  }) => Promise<void> | void

  /** Attached show timeline changed; full snapshot included (see ADR 0028). */
  SHOW_SCHEDULE_UPDATED: (data: {
    roomId: string
    showId: string | null
    snapshot: RoomScheduleSnapshotDTO | null
  }) => Promise<void> | void

  // Chat events
  MESSAGE_RECEIVED: (data: { roomId: string; message: ChatMessage }) => Promise<void> | void

  MESSAGE_DELETED: (data: { roomId: string; timestamp: string }) => Promise<void> | void

  MESSAGES_CLEARED: (data: { roomId: string }) => Promise<void> | void

  TYPING_CHANGED: (data: { roomId: string; typing: User[] }) => Promise<void> | void

  // Plugin/Config events
  CONFIG_CHANGED: (data: {
    roomId: string
    /** The name of the plugin whose config changed */
    pluginName: string
    config: Record<string, unknown>
    previousConfig: Record<string, unknown>
  }) => Promise<void> | void

  // Stream health events (MediaMTX webhook → API)
  STREAM_HEALTH_CHANGED: (data: {
    roomId: string
    status: "online" | "offline"
    /**
     * When set, this health update applies to the experimental WebRTC ingest only
     * (`radio` + `liveIngestEnabled`). Omitted for `live` rooms (primary path).
     */
    ingest?: "webrtc_experimental"
  }) => Promise<void> | void

  // Error events
  ERROR_OCCURRED: (data: {
    roomId: string
    error: Error | string
    status?: number
    message?: string
  }) => Promise<void> | void

  // Sound effect events
  SOUND_EFFECT_QUEUED: (data: {
    roomId: string
    url: string
    volume: number
  }) => Promise<void> | void

  // Screen effect events
  SCREEN_EFFECT_QUEUED: (data: {
    roomId: string
    target: ScreenEffectTarget
    targetId?: string // timestamp for messages, componentId for plugins, or "latest"
    effect: ScreenEffectName
    duration?: number // optional custom duration in ms
  }) => Promise<void> | void

  // ==========================================================================
  // Game Session events
  // ==========================================================================

  /** Fired when a session is started (manually or via a segment). */
  GAME_SESSION_STARTED: (data: {
    roomId: string
    sessionId: string
    config: GameSessionConfig
  }) => Promise<void> | void

  /** Fired when a session ends, with final per-user results. */
  GAME_SESSION_ENDED: (data: {
    roomId: string
    sessionId: string
    results: GameSessionResults
  }) => Promise<void> | void

  /**
   * Delta event for one or more attribute changes for a single user.
   * Plugins / UI layers may use changes to animate without re-fetching.
   */
  GAME_STATE_CHANGED: (data: {
    roomId: string
    sessionId: string
    userId: string
    changes: GameStateChange[]
  }) => Promise<void> | void

  /** Fired when a modifier is applied or stacked onto a user. */
  GAME_MODIFIER_APPLIED: (data: {
    roomId: string
    sessionId: string
    userId: string
    modifier: GameStateModifier
  }) => Promise<void> | void

  /** Fired when a modifier is removed (manually or via expiry). */
  GAME_MODIFIER_REMOVED: (data: {
    roomId: string
    sessionId: string
    userId: string
    modifierId: string
    reason: "manual" | "expired"
  }) => Promise<void> | void

  // ==========================================================================
  // Inventory events
  // ==========================================================================

  INVENTORY_ITEM_ACQUIRED: (data: {
    roomId: string
    sessionId: string
    userId: string
    item: InventoryItem
    source: InventoryAcquisitionSource
  }) => Promise<void> | void

  INVENTORY_ITEM_USED: (data: {
    roomId: string
    sessionId: string
    userId: string
    item: InventoryItem
    result: ItemUseResult
  }) => Promise<void> | void

  INVENTORY_ITEM_REMOVED: (data: {
    roomId: string
    sessionId: string
    userId: string
    itemId: string
    quantity: number
  }) => Promise<void> | void

  INVENTORY_ITEM_TRANSFERRED: (data: {
    roomId: string
    sessionId: string
    fromUserId: string
    toUserId: string
    item: InventoryItem
    quantity: number
  }) => Promise<void> | void
}

/**
 * Available screen effect animation names (from animate.css attention seekers)
 */
export type ScreenEffectName =
  | "bounce"
  | "flash"
  | "pulse"
  | "rubberBand"
  | "shakeX"
  | "shakeY"
  | "headShake"
  | "swing"
  | "tada"
  | "wobble"
  | "jello"
  | "heartBeat"

/**
 * Screen effect target types
 */
export type ScreenEffectTarget = "room" | "nowPlaying" | "message" | "plugin" | "user"

/**
 * Extract the payload type for a given event
 */
export type SystemEventPayload<K extends keyof SystemEventHandlers> = Parameters<
  SystemEventHandlers[K]
>[0]

/**
 * All system event names
 */
export type SystemEventName = keyof SystemEventHandlers
