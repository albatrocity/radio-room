import type {
  AppContext,
  RoomExportData,
  RoomExportInfo,
  ExportFormat,
  PluginExportAugmentation,
  ReactionStore,
} from "@repo/types"
import {
  findRoom,
  getRoomPlaylist,
  getMessages,
  getRoomUsers,
  getQueue,
  getAllRoomReactions,
  removeSensitiveRoomAttributes,
  getRoomUserHistory,
  getUsersByIds,
} from "../operations/data"
import { formatRoomExportAsMarkdown } from "../lib/markdownFormatter"

/**
 * Service for exporting room data in various formats.
 * Aggregates data from all sources and supports plugin augmentation.
 */
export class ExportService {
  constructor(private context: AppContext) {}

  /**
   * Export room data in the specified format.
   * @param roomId - The room to export
   * @param format - Output format (json or markdown)
   * @returns Formatted export data as string
   */
  async exportRoom(roomId: string, format: ExportFormat): Promise<string> {
    // Build the canonical export data
    const exportData = await this.buildExportData(roomId)

    // Let plugins augment the export
    const pluginAugmentations = await this.getPluginAugmentations(roomId, exportData)

    // Merge plugin exports into the data
    if (Object.keys(pluginAugmentations.data).length > 0) {
      exportData.pluginExports = pluginAugmentations.data
    }

    // Format based on requested output
    if (format === "markdown") {
      return formatRoomExportAsMarkdown(
        exportData,
        pluginAugmentations.markdownSections,
        this.context.pluginRegistry,
        roomId,
      )
    }

    // JSON format - return the data as-is
    return JSON.stringify(exportData, null, 2)
  }

  /**
   * Build the canonical room export data structure.
   */
  private async buildExportData(roomId: string): Promise<RoomExportData> {
    // Fetch all data in parallel (including user history IDs)
    const [room, playlist, messages, users, queue, reactions, userHistoryIds] = await Promise.all([
      findRoom({ context: this.context, roomId }),
      getRoomPlaylist({ context: this.context, roomId }),
      this.getAllMessages(roomId),
      getRoomUsers({ context: this.context, roomId }),
      getQueue({ context: this.context, roomId }),
      getAllRoomReactions({ context: this.context, roomId }),
      getRoomUserHistory({ context: this.context, roomId }),
    ])

    if (!room) {
      throw new Error(`Room ${roomId} not found`)
    }

    // Lookup user data for all users in history
    const userHistory = await getUsersByIds({ context: this.context, userIds: userHistoryIds })

    // Build room info (exclude sensitive data)
    const sanitizedRoom = removeSensitiveRoomAttributes(room)
    const roomInfo: RoomExportInfo = {
      id: sanitizedRoom.id,
      title: sanitizedRoom.title,
      description: sanitizedRoom.extraInfo,
      type: sanitizedRoom.type,
      createdAt: sanitizedRoom.createdAt,
      creator: sanitizedRoom.creator,
    }

    return {
      exportedAt: new Date().toISOString(),
      room: roomInfo,
      users,
      userHistory,
      playlist,
      chat: messages,
      queue,
      reactions: reactions || { message: {}, track: {} },
    }
  }

  /**
   * Get all messages for a room (with higher limit for export).
   */
  private async getAllMessages(roomId: string) {
    // Fetch a large batch for export purposes
    return getMessages({
      context: this.context,
      roomId,
      offset: 0,
      size: 10000, // Large limit for export
    })
  }

  /**
   * Collect augmentations from all plugins.
   */
  private async getPluginAugmentations(
    roomId: string,
    exportData: RoomExportData,
  ): Promise<{ data: Record<string, unknown>; markdownSections: string[] }> {
    const pluginData: Record<string, unknown> = {}
    const markdownSections: string[] = []

    // Get the plugin registry
    const registry = this.context.pluginRegistry
    if (!registry) {
      return { data: pluginData, markdownSections }
    }

    // Get all active plugins for this room
    const debugInfo = registry.getDebugInfo()
    const roomPlugins = debugInfo.rooms?.[roomId]?.activePlugins || []

    // Call augmentRoomExport on each plugin that implements it
    for (const pluginName of roomPlugins) {
      try {
        const augmentation = await registry.callPluginExportAugmentation(
          roomId,
          pluginName,
          exportData,
        )
        if (augmentation) {
          if (augmentation.data) {
            pluginData[pluginName] = augmentation.data
          }
          if (augmentation.markdownSections) {
            markdownSections.push(...augmentation.markdownSections)
          }
        }
      } catch (error) {
        console.error(`[ExportService] Error calling augmentRoomExport for ${pluginName}:`, error)
      }
    }

    return { data: pluginData, markdownSections }
  }
}
