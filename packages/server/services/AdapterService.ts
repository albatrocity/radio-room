import { AppContext, PlaybackController, MetadataSource, MediaSource } from "@repo/types"
import { findRoom } from "../operations/data"

export class AdapterService {
  private context: AppContext

  constructor(context: AppContext) {
    this.context = context
  }

  /**
   * Get the PlaybackController for a room (uses room creator's credentials)
   */
  async getRoomPlaybackController(roomId: string): Promise<PlaybackController | null> {
    const room = await findRoom({ context: this.context, roomId })
    
    if (!room || !room.playbackControllerId) {
      return null
    }

    const controller = this.context.adapters.playbackControllers.get(room.playbackControllerId)
    return controller ?? null
  }

  /**
   * Get the MetadataSource for a room
   * @param roomId - The room ID
   * @param userId - Optional user ID for user-specific credentials (defaults to room creator)
   */
  async getRoomMetadataSource(roomId: string, userId?: string): Promise<MetadataSource | null> {
    const room = await findRoom({ context: this.context, roomId })
    
    if (!room || !room.metadataSourceId) {
      return null
    }

    // For now, always use the room-wide metadata source
    // In the future, we could instantiate per-user metadata sources here
    const source = this.context.adapters.metadataSources.get(room.metadataSourceId)
    return source ?? null
  }

  /**
   * Get the MediaSource for a room
   */
  async getRoomMediaSource(roomId: string): Promise<MediaSource | null> {
    const room = await findRoom({ context: this.context, roomId })
    
    if (!room || !room.mediaSourceId) {
      return null
    }

    const source = this.context.adapters.mediaSources.get(room.mediaSourceId)
    return source ?? null
  }

  /**
   * Check if a room has a specific adapter type configured
   */
  async hasAdapter(roomId: string, adapterType: 'playback' | 'metadata' | 'media'): Promise<boolean> {
    const room = await findRoom({ context: this.context, roomId })
    
    if (!room) {
      return false
    }

    switch (adapterType) {
      case 'playback':
        return !!room.playbackControllerId
      case 'metadata':
        return !!room.metadataSourceId
      case 'media':
        return !!room.mediaSourceId
      default:
        return false
    }
  }
}

