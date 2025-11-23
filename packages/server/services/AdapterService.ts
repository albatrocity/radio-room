import { AppContext, PlaybackController, MetadataSource, MediaSource } from "@repo/types"
import { findRoom } from "../operations/data"

/**
 * Service configuration registry
 * Maps service names to their OAuth client IDs
 */
const SERVICE_CONFIGS: Record<string, { clientId: string }> = {
  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID ?? "",
  },
  tidal: {
    clientId: process.env.TIDAL_CLIENT_ID ?? "",
  },
  applemusic: {
    clientId: process.env.APPLE_MUSIC_CLIENT_ID ?? "",
  },
}

/**
 * Extract service name from adapter ID
 * Examples: "spotify-playback" -> "spotify", "spotify-metadata" -> "spotify"
 */
function getServiceName(adapterId: string): string {
  return adapterId.split("-")[0]
}

/**
 * Get service configuration by adapter ID
 */
function getServiceConfig(adapterId: string): { clientId: string } {
  const serviceName = getServiceName(adapterId)
  return SERVICE_CONFIGS[serviceName] || { clientId: "" }
}

export class AdapterService {
  private context: AppContext
  private roomPlaybackControllers: Map<string, PlaybackController> = new Map()
  private roomMetadataSources: Map<string, MetadataSource> = new Map()

  constructor(context: AppContext) {
    this.context = context
  }

  /**
   * Get the PlaybackController for a room (uses room creator's credentials)
   * Creates and caches a room-specific instance with dynamic token fetching
   */
  async getRoomPlaybackController(roomId: string): Promise<PlaybackController | null> {
    // Check cache first
    if (this.roomPlaybackControllers.has(roomId)) {
      return this.roomPlaybackControllers.get(roomId)!
    }

    const room = await findRoom({ context: this.context, roomId })
    
    if (!room || !room.playbackControllerId) {
      return null
    }

    const serviceName = room.playbackControllerId
    const adapterModule = this.context.adapters.playbackControllerModules.get(serviceName)
    
    if (!adapterModule) {
      console.error(`No adapter module found for playback controller: ${serviceName}`)
      return null
    }

    const serviceConfig = getServiceConfig(serviceName)
    if (!serviceConfig.clientId) {
      console.error(`No client ID configured for service: ${getServiceName(serviceName)}`)
      return null
    }

    // Create a room-specific adapter instance with dynamic token fetching
    const playbackController = await adapterModule.register({
      name: serviceName,
      authentication: {
        type: "oauth",
        clientId: serviceConfig.clientId,
        token: {
          accessToken: "", // Not used
          refreshToken: "",
        },
        getStoredTokens: async () => {
          // This function is called on each API operation to get fresh tokens
          // for the room creator
          if (!this.context.data?.getUserServiceAuth) {
            throw new Error("getUserServiceAuth not available in context")
          }

          const auth = await this.context.data.getUserServiceAuth({
            userId: room.creator,
            serviceName,
          })

          if (!auth || !auth.accessToken) {
            throw new Error(`No auth tokens found for room creator ${room.creator}`)
          }

          return {
            accessToken: auth.accessToken,
            refreshToken: auth.refreshToken,
          }
        },
      },
      onRegistered: () => {},
      onAuthenticationCompleted: () => {},
      onAuthenticationFailed: (error) => console.error("Playback controller authentication failed:", error),
      onAuthorizationCompleted: () => {},
      onAuthorizationFailed: (error) => console.error("Playback controller authorization failed:", error),
      onPlay: () => {},
      onPause: () => {},
      onChangeTrack: () => {},
      onPlaybackStateChange: () => {},
      onPlaybackQueueChange: () => {},
      onPlaybackPositionChange: () => {},
      onError: (error) => console.error("Playback controller error:", error),
    })

    // Cache the instance
    this.roomPlaybackControllers.set(roomId, playbackController)

    return playbackController
  }

  /**
   * Get the MetadataSource for a room (uses room creator's credentials)
   * Creates and caches a room-specific instance with dynamic token fetching
   */
  async getRoomMetadataSource(roomId: string): Promise<MetadataSource | null> {
    // Check cache first
    if (this.roomMetadataSources.has(roomId)) {
      return this.roomMetadataSources.get(roomId)!
    }

    const room = await findRoom({ context: this.context, roomId })
    
    if (!room || !room.metadataSourceId) {
      return null
    }

    const serviceName = room.metadataSourceId
    const adapterModule = this.context.adapters.metadataSourceModules.get(serviceName)
    
    if (!adapterModule) {
      console.error(`No adapter module found for metadata source: ${serviceName}`)
      return null
    }

    const clientId = process.env.SPOTIFY_CLIENT_ID

    if (!clientId) {
      console.error("SPOTIFY_CLIENT_ID is not defined")
      return null
    }

    // Create a room-specific metadata source instance with dynamic token fetching
    const metadataSource = await adapterModule.register({
      name: serviceName,
      url: "",
      authentication: {
        type: "oauth",
        clientId,
        token: {
          accessToken: "", // Not used
          refreshToken: "",
        },
        getStoredTokens: async () => {
          // This function is called on each API operation to get fresh tokens
          // for the room creator
          if (!this.context.data?.getUserServiceAuth) {
            throw new Error("getUserServiceAuth not available in context")
          }

          const auth = await this.context.data.getUserServiceAuth({
            userId: room.creator,
            serviceName,
          })

          if (!auth || !auth.accessToken) {
            throw new Error(`No auth tokens found for room creator ${room.creator}`)
          }

          return {
            accessToken: auth.accessToken,
            refreshToken: auth.refreshToken,
          }
        },
      },
      registerJob: async (job) => {
        if (this.context.jobService) {
          await this.context.jobService.scheduleJob(job)
        }
        return job
      },
      onRegistered: () => {},
      onAuthenticationCompleted: () => {},
      onAuthenticationFailed: (error) => console.error("Metadata source authentication failed:", error),
      onSearchResults: () => {},
      onError: (error) => console.error("Metadata source error:", error),
    })

    // Cache the instance
    this.roomMetadataSources.set(roomId, metadataSource)

    return metadataSource
  }

  /**
   * Get a user-specific MetadataSource for a room (for library operations)
   * This creates a fresh instance with the user's current credentials
   * @param roomId - The room ID
   * @param userId - Optional user ID for user-specific credentials (defaults to room creator)
   */
  async getUserMetadataSource(roomId: string, userId?: string): Promise<MetadataSource | null> {
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

    // Get service-specific config
    const serviceConfig = getServiceConfig(room.metadataSourceId)
    if (!serviceConfig.clientId) {
      console.error(`No client ID configured for service: ${getServiceName(room.metadataSourceId)}`)
      return null
    }

    // Create a user-specific metadata source with fresh credentials
    try {
      const userMetadataSource = await adapterModule.register({
        name: room.metadataSourceId,
        url: "",
        authentication: {
          type: "oauth",
          clientId: serviceConfig.clientId,
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

