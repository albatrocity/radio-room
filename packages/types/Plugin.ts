import type { AppContext } from "./AppContext"
import type { Room, RoomMeta } from "./Room"
import type { QueueItem } from "./Queue"
import type { Reaction, ReactionPayload, ReactionStore } from "./Reaction"
import type { User } from "./User"
import type { ReactionSubject } from "./ReactionSubject"
import type { ChatMessage } from "./ChatMessage"

/**
 * Plugin storage API - provides sandboxed Redis access
 * All keys are automatically namespaced to prevent conflicts
 */
export interface PluginStorage {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttl?: number): Promise<void>
  inc(key: string, by?: number): Promise<number>
  dec(key: string, by?: number): Promise<number>
  del(key: string): Promise<void>
  exists(key: string): Promise<boolean>
}

/**
 * Plugin API - provides safe methods for plugins to interact with the system
 */
export interface PluginAPI {
  getNowPlaying(roomId: string): Promise<QueueItem | null>
  getReactions(params: {
    roomId: string
    reactTo: ReactionSubject
    filterEmoji?: string
  }): Promise<Reaction[]>
  getUsers(roomId: string, params?: { status?: "listening" | "participating" }): Promise<User[]>
  skipTrack(roomId: string, trackId: string): Promise<void>
  sendSystemMessage(roomId: string, message: string, meta?: ChatMessage["meta"]): Promise<void>
  getPluginConfig(roomId: string, pluginName: string): Promise<any | null>
  setPluginConfig(roomId: string, pluginName: string, config: any): Promise<void>
}

/**
 * Lifecycle events that plugins can listen to
 *
 * These event payloads are aligned with the Redis PubSub system events
 * and Socket.IO frontend events through the SystemEvents layer.
 *
 * Event naming convention:
 * - All events use SCREAMING_SNAKE_CASE across all layers
 * - Redis PubSub channels: SYSTEM:SCREAMING_SNAKE_CASE
 */
export type PluginLifecycleEvents = {
  TRACK_CHANGED: (data: {
    roomId: string
    track: QueueItem
    meta?: RoomMeta
  }) => Promise<void> | void
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
  USER_JOINED: (data: { roomId: string; user: User; users?: User[] }) => Promise<void> | void
  USER_LEFT: (data: { roomId: string; user: User }) => Promise<void> | void
  USER_STATUS_CHANGED: (data: {
    roomId: string
    user: User
    oldStatus?: string
  }) => Promise<void> | void
  ROOM_DELETED: (data: { roomId: string }) => Promise<void> | void
  ROOM_SETTINGS_UPDATED: (data: { roomId: string; room: Room }) => Promise<void> | void
  CONFIG_CHANGED: (data: {
    roomId: string
    config: Record<string, unknown>
    previousConfig: Record<string, unknown>
  }) => Promise<void> | void
  MESSAGE_RECEIVED: (data: { roomId: string; message: ChatMessage }) => Promise<void> | void
  MESSAGES_CLEARED: (data: { roomId: string }) => Promise<void> | void
  TYPING_CHANGED: (data: { roomId: string; typing: User[] }) => Promise<void> | void
  PLAYLIST_TRACK_ADDED: (data: { roomId: string; track: QueueItem }) => Promise<void> | void
  USER_KICKED: (data: { roomId: string; user: User; reason?: string }) => Promise<void> | void
  ERROR_OCCURRED: (data: {
    roomId: string
    error: Error | string
    status?: number
    message?: string
  }) => Promise<void> | void
  MEDIA_SOURCE_STATUS_CHANGED: (data: {
    roomId: string
    status: "online" | "offline" | "connecting" | "error"
    sourceType?: "jukebox" | "radio"
    bitrate?: number // Radio-specific: stream bitrate
    error?: string
  }) => Promise<void> | void
}

/**
 * Lifecycle event registration interface
 */
export interface PluginLifecycle {
  on<K extends keyof PluginLifecycleEvents>(event: K, handler: PluginLifecycleEvents[K]): void
  off<K extends keyof PluginLifecycleEvents>(event: K, handler: PluginLifecycleEvents[K]): void
}

/**
 * Context provided to each plugin instance
 */
export interface PluginContext {
  roomId: string
  api: PluginAPI
  storage: PluginStorage
  lifecycle: PluginLifecycle
  getRoom: () => Promise<Room | null>
  appContext: AppContext
}

/**
 * Base plugin interface
 */
export interface Plugin {
  name: string
  version: string
  register(context: PluginContext): Promise<void>
  cleanup(): Promise<void>
}

/**
 * Plugin factory function signature
 */
export type PluginFactory = (appContext: AppContext) => Plugin
