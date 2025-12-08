import { z } from "zod"
import type { Room } from "./Room"
import type { User } from "./User"
import type { QueueItem } from "./Queue"
import type { ChatMessage } from "./ChatMessage"
import type { ReactionStore } from "./Reaction"

// =============================================================================
// Export Format Schema & Type
// =============================================================================

export const exportFormatSchema = z.enum(["json", "markdown"])
export type ExportFormat = z.infer<typeof exportFormatSchema>

// =============================================================================
// Room Export Data Schema & Type
// =============================================================================

/**
 * Subset of Room data safe for export (excludes sensitive fields like password)
 */
export interface RoomExportInfo {
  id: string
  title: string
  description?: string
  type: "jukebox" | "radio"
  createdAt: string
  creator: string
}

/**
 * Complete room export data structure.
 * This is the canonical schema - JSON export returns this as-is,
 * Markdown export transforms this into human-readable format.
 */
export interface RoomExportData {
  /** ISO timestamp of when the export was generated */
  exportedAt: string

  /** Room metadata */
  room: RoomExportInfo

  /** List of users currently in the room */
  users: User[]

  /**
   * All unique users who ever joined this room.
   * Looked up from stored userIds - users whose data has expired
   * or been deleted will not appear in this list.
   */
  userHistory: User[]

  /**
   * Complete playlist history with:
   * - Track metadata (including metadataSources for service links)
   * - Who added each track and when
   * - Plugin data from augmentation (e.g., skip/vote data)
   * - Reactions are merged via reactionsByTrack
   */
  playlist: QueueItem[]

  /**
   * Chat message history with reactions
   */
  chat: ChatMessage[]

  /**
   * Current queue (upcoming tracks)
   */
  queue: QueueItem[]

  /**
   * All reactions organized by type and subject ID
   */
  reactions: ReactionStore

  /**
   * Additional plugin-specific export data.
   * Keyed by plugin name, contains summary stats or other data
   * that plugins add via augmentRoomExport.
   */
  pluginExports?: Record<string, unknown>
}

// =============================================================================
// Plugin Export Augmentation Types
// =============================================================================

/**
 * Context passed to plugin formatPluginDataMarkdown method
 */
export interface PluginMarkdownContext {
  type: "playlist" | "chat" | "queue" | "nowPlaying"
}

/**
 * Return type for Plugin.augmentRoomExport
 */
export interface PluginExportAugmentation {
  /** Additional data to include in pluginExports[pluginName] */
  data?: Record<string, unknown>

  /** Additional markdown sections to append to the export */
  markdownSections?: string[]
}
