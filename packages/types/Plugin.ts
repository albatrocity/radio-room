import type { AppContext } from "./AppContext"
import type { Room, RoomMeta } from "./Room"
import type { QueueItem } from "./Queue"
import type { Reaction, ReactionPayload } from "./Reaction"
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
 */
export type PluginLifecycleEvents = {
  trackChanged: (data: { roomId: string; track: QueueItem; roomMeta?: RoomMeta }) => Promise<void> | void
  reactionAdded: (data: { roomId: string; reaction: ReactionPayload }) => Promise<void> | void
  reactionRemoved: (data: { roomId: string; reaction: ReactionPayload }) => Promise<void> | void
  userJoined: (data: { roomId: string; user: User }) => Promise<void> | void
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
