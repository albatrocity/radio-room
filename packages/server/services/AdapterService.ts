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

    // Get the user ID (default to room creator)
    const targetUserId = userId ?? room.creator

    // Get the adapter module
    const adapterModule = this.context.adapters.metadataSourceModules.get(room.metadataSourceId)
    
    if (!adapterModule) {
      console.error(`No adapter module found for metadata source: ${room.metadataSourceId}`)
      return null
    }

    // Get user's credentials from Redis
    if (!this.context.data?.getUserServiceAuth) {
      console.error("getUserServiceAuth not available in context")
      return null
    }

    const auth = await this.context.data.getUserServiceAuth({
      userId: targetUserId,
      serviceName: room.metadataSourceId,
    })

    if (!auth || !auth.accessToken) {
      console.error(`No auth tokens found for user ${targetUserId} on service ${room.metadataSourceId}`)
      return null
    }

    // Get service-specific config (e.g., Spotify client ID)
    const clientId = room.metadataSourceId === "spotify" 
      ? process.env.SPOTIFY_CLIENT_ID ?? ""
      : ""

    // Create a user-specific metadata source with fresh credentials
    try {
      const userMetadataSource = await adapterModule.register({
        name: room.metadataSourceId,
        url: "",
        authentication: {
          type: "oauth",
          clientId,
          token: {
            accessToken: auth.accessToken,
            refreshToken: auth.refreshToken,
          },
          async getStoredTokens() {
            return {
              accessToken: auth.accessToken,
              refreshToken: auth.refreshToken,
            }
          },
        },
        registerJob: () => Promise.resolve({} as any),
        onRegistered: () => {},
        onAuthenticationCompleted: () => {},
        onAuthenticationFailed: () => {},
        onSearchResults: () => {},
        onError: () => {},
      })

      return userMetadataSource
    } catch (error) {
      console.error(`Error creating user-specific metadata source:`, error)
      return null
    }
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

