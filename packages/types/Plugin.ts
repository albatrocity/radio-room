import type { AppContext } from "./AppContext"
import type { Room, RoomMeta } from "./Room"
import type { QueueItem } from "./Queue"
import type { Reaction, ReactionPayload, ReactionStore } from "./Reaction"
import type { User } from "./User"
import type { ReactionSubject } from "./ReactionSubject"

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
  sendSystemMessage(roomId: string, message: string): Promise<void>
  getPluginConfig(roomId: string, pluginName: string): Promise<any | null>
  setPluginConfig(roomId: string, pluginName: string, config: any): Promise<void>
}

/**
 * Lifecycle events that plugins can listen to
 *
 * These event payloads are aligned with the Redis PubSub system events
 * to enable unified event emission through the SystemEvents layer.
 *
 * Socket.IO Event Mapping (for frontend):
 * - trackChanged → NOW_PLAYING
 * - reactionAdded → REACTIONS
 * - reactionRemoved → REACTIONS
 * - userJoined → USER_JOINED
 * - userLeft → USER_LEFT
 * - userStatusChanged → USER_STATUS_CHANGED
 * - roomDeleted → ROOM_DELETED
 * - roomSettingsUpdated → ROOM_SETTINGS
 * - configChanged → CONFIG_CHANGED
 * - messageReceived → NEW_MESSAGE
 * - messagesCleared → SET_MESSAGES
 * - typingChanged → TYPING
 * - playlistTrackAdded → PLAYLIST_TRACK_ADDED
 * - userKicked → KICKED
 * - errorOccurred → ERROR
 */
export type PluginLifecycleEvents = {
  trackChanged: (data: {
    roomId: string
    track: QueueItem
    roomMeta?: RoomMeta
  }) => Promise<void> | void
  reactionAdded: (data: {
    roomId: string
    reaction: ReactionPayload
    reactions?: ReactionStore
  }) => Promise<void> | void
  reactionRemoved: (data: {
    roomId: string
    reaction: ReactionPayload
    reactions?: ReactionStore
  }) => Promise<void> | void
  userJoined: (data: { roomId: string; user: User; users?: User[] }) => Promise<void> | void
  userLeft: (data: { roomId: string; user: User }) => Promise<void> | void
  userStatusChanged: (data: {
    roomId: string
    user: User
    oldStatus?: string
  }) => Promise<void> | void
  roomDeleted: (data: { roomId: string }) => Promise<void> | void
  roomSettingsUpdated: (data: { roomId: string; room: Room }) => Promise<void> | void
  configChanged: (data: {
    roomId: string
    config: any
    previousConfig: any
  }) => Promise<void> | void
  messageReceived: (data: { roomId: string; message: any }) => Promise<void> | void
  messagesCleared: (data: { roomId: string }) => Promise<void> | void
  typingChanged: (data: { roomId: string; typing: string[] }) => Promise<void> | void
  playlistTrackAdded: (data: { roomId: string; track: QueueItem }) => Promise<void> | void
  userKicked: (data: { roomId: string; userId: string; message?: any }) => Promise<void> | void
  errorOccurred: (data: {
    roomId: string
    error: any
    status?: number
    message?: string
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
