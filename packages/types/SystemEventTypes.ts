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
    sourceType?: "jukebox" | "radio"
    bitrate?: number
    error?: string
  }) => Promise<void> | void

  PLAYLIST_TRACK_ADDED: (data: { roomId: string; track: QueueItem }) => Promise<void> | void

  PLAYLIST_TRACK_UPDATED: (data: { roomId: string; track: QueueItem }) => Promise<void> | void

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

  USER_LEFT: (data: { roomId: string; user: User }) => Promise<void> | void

  USER_STATUS_CHANGED: (data: {
    roomId: string
    user: User
    oldStatus?: string
  }) => Promise<void> | void

  USER_KICKED: (data: { roomId: string; user: User; reason?: string }) => Promise<void> | void

  // Room events
  ROOM_DELETED: (data: { roomId: string }) => Promise<void> | void

  ROOM_SETTINGS_UPDATED: (data: { roomId: string; room: Room }) => Promise<void> | void

  // Chat events
  MESSAGE_RECEIVED: (data: { roomId: string; message: ChatMessage }) => Promise<void> | void

  MESSAGES_CLEARED: (data: { roomId: string }) => Promise<void> | void

  TYPING_CHANGED: (data: { roomId: string; typing: User[] }) => Promise<void> | void

  // Plugin/Config events
  CONFIG_CHANGED: (data: {
    roomId: string
    config: Record<string, unknown>
    previousConfig: Record<string, unknown>
  }) => Promise<void> | void

  // Error events
  ERROR_OCCURRED: (data: {
    roomId: string
    error: Error | string
    status?: number
    message?: string
  }) => Promise<void> | void
}

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
