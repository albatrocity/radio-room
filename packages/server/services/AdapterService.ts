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
      onAuthenticationFailed: (error) =>
        console.error("Playback controller authentication failed:", error),
      onAuthorizationCompleted: () => {},
      onAuthorizationFailed: (error) =>
        console.error("Playback controller authorization failed:", error),
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
   * Get the primary MetadataSource for a room (uses room creator's credentials)
   * Creates and caches a room-specific instance with dynamic token fetching
   */
  async getRoomMetadataSource(roomId: string): Promise<MetadataSource | null> {
    const sources = await this.getRoomMetadataSources(roomId)
    // Return the first (primary) source
    const firstSource = sources.values().next()
    return firstSource.done ? null : firstSource.value
  }

  /**
   * Get all MetadataSources for a room (uses room creator's credentials)
   * Creates and caches room-specific instances with dynamic token fetching
   * Returns a Map keyed by source name (e.g., "spotify", "tidal")
   */
  async getRoomMetadataSources(roomId: string): Promise<Map<string, MetadataSource>> {
    const room = await findRoom({ context: this.context, roomId })

    if (!room || !room.metadataSourceIds?.length) {
      return new Map()
    }

    const sources = new Map<string, MetadataSource>()

    for (const sourceId of room.metadataSourceIds) {
      // Check cache first
      const cacheKey = `${roomId}:${sourceId}`
      if (this.roomMetadataSources.has(cacheKey)) {
        sources.set(sourceId, this.roomMetadataSources.get(cacheKey)!)
        continue
      }

      const adapterModule = this.context.adapters.metadataSourceModules.get(sourceId)

      if (!adapterModule) {
        console.error(`No adapter module found for metadata source: ${sourceId}`)
        continue
      }

      const serviceConfig = getServiceConfig(sourceId)
      if (!serviceConfig.clientId) {
        console.error(`No client ID configured for service: ${getServiceName(sourceId)}`)
        continue
      }

      try {
        // Create a room-specific metadata source instance with dynamic token fetching
        const metadataSource = await adapterModule.register({
          name: sourceId,
          url: "",
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
                serviceName: sourceId,
              })

              if (!auth || !auth.accessToken) {
                throw new Error(`No auth tokens found for room creator ${room.creator}`)
              }

              // Check if token is expired or about to expire (within 5 minutes)
              const expiresAt = auth.expiresAt ?? 0
              const isExpired = expiresAt > 0 && Date.now() > expiresAt - 5 * 60 * 1000

              if (isExpired) {
                console.log(`[AdapterService] Token for ${sourceId} is expired, refreshing...`)
                
                // Get the service auth adapter to refresh
                const serviceAuthAdapter = this.context.adapters.serviceAuth.get(sourceId)
                if (serviceAuthAdapter?.refreshAuth) {
                  try {
                    const refreshed = await serviceAuthAdapter.refreshAuth(room.creator)
                    console.log(`[AdapterService] Token refreshed for ${sourceId}`)
                    return {
                      accessToken: refreshed.accessToken,
                      refreshToken: refreshed.refreshToken,
                      metadata: auth.metadata, // Preserve metadata (e.g., tidalUserId)
                    }
                  } catch (refreshError) {
                    console.error(`[AdapterService] Failed to refresh ${sourceId} token:`, refreshError)
                    // Return the old tokens and let the API call fail
                  }
                }
              }

              return {
                accessToken: auth.accessToken,
                refreshToken: auth.refreshToken,
                metadata: auth.metadata,
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
          onAuthenticationFailed: (error) =>
            console.error(`Metadata source ${sourceId} authentication failed:`, error),
          onSearchResults: () => {},
          onError: (error) => console.error(`Metadata source ${sourceId} error:`, error),
        })

        // Cache the instance
        this.roomMetadataSources.set(cacheKey, metadataSource)
        sources.set(sourceId, metadataSource)
      } catch (error) {
        console.error(`Error creating metadata source ${sourceId}:`, error)
      }
    }

    return sources
  }

  /**
   * Get a user-specific MetadataSource for a room (for library operations)
   * This creates a fresh instance with the user's current credentials
   * @param roomId - The room ID
   * @param userId - Optional user ID for user-specific credentials (defaults to room creator)
   */
  async getUserMetadataSource(roomId: string, userId?: string): Promise<MetadataSource | null> {
    const room = await findRoom({ context: this.context, roomId })

    // Use the first (primary) metadata source
    const primaryMetadataSourceId = room?.metadataSourceIds?.[0]
    if (!room || !primaryMetadataSourceId) {
      return null
    }

    // Get the user ID (default to room creator)
    const targetUserId = userId ?? room.creator

    // Get the adapter module
    const adapterModule = this.context.adapters.metadataSourceModules.get(primaryMetadataSourceId)

    if (!adapterModule) {
      console.error(`No adapter module found for metadata source: ${primaryMetadataSourceId}`)
      return null
    }

    // Get user's credentials from Redis
    if (!this.context.data?.getUserServiceAuth) {
      console.error("getUserServiceAuth not available in context")
      return null
    }

    const auth = await this.context.data.getUserServiceAuth({
      userId: targetUserId,
      serviceName: primaryMetadataSourceId,
    })

    if (!auth || !auth.accessToken) {
      console.error(
        `No auth tokens found for user ${targetUserId} on service ${primaryMetadataSourceId}`,
      )
      return null
    }

    // Get service-specific config
    const serviceConfig = getServiceConfig(primaryMetadataSourceId)
    if (!serviceConfig.clientId) {
      console.error(`No client ID configured for service: ${getServiceName(primaryMetadataSourceId)}`)
      return null
    }

    // Create a user-specific metadata source with fresh credentials
    try {
      const userMetadataSource = await adapterModule.register({
        name: primaryMetadataSourceId,
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
   * Get a specific MetadataSource for a user (for operations like playlist creation)
   * This creates a fresh instance with the user's current credentials for a specific service
   * @param roomId - The room ID
   * @param userId - User ID for credentials
   * @param sourceType - The metadata source type (e.g., "spotify", "tidal")
   */
  async getMetadataSourceForUser(
    roomId: string,
    userId: string,
    sourceType: string,
  ): Promise<MetadataSource | null> {
    const room = await findRoom({ context: this.context, roomId })

    // Check if the requested source is enabled for this room
    if (!room?.metadataSourceIds?.includes(sourceType)) {
      console.error(`Metadata source ${sourceType} not enabled for room ${roomId}`)
      return null
    }

    // Get the adapter module
    const adapterModule = this.context.adapters.metadataSourceModules.get(sourceType)

    if (!adapterModule) {
      console.error(`No adapter module found for metadata source: ${sourceType}`)
      return null
    }

    // Get user's credentials from Redis
    if (!this.context.data?.getUserServiceAuth) {
      console.error("getUserServiceAuth not available in context")
      return null
    }

    const auth = await this.context.data.getUserServiceAuth({
      userId,
      serviceName: sourceType,
    })

    if (!auth || !auth.accessToken) {
      console.error(`No auth tokens found for user ${userId} on service ${sourceType}`)
      return null
    }

    console.log(`[AdapterService.getMetadataSourceForUser] Auth metadata for ${sourceType}:`, auth.metadata)

    // Get service-specific config
    const serviceConfig = getServiceConfig(sourceType)
    if (!serviceConfig.clientId) {
      console.error(`No client ID configured for service: ${getServiceName(sourceType)}`)
      return null
    }

    // Create a user-specific metadata source with fresh credentials
    try {
      const userMetadataSource = await adapterModule.register({
        name: sourceType,
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
              metadata: auth.metadata, // Pass metadata (e.g., tidalUserId)
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
      console.error(`Error creating user-specific metadata source for ${sourceType}:`, error)
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
  async hasAdapter(
    roomId: string,
    adapterType: "playback" | "metadata" | "media",
  ): Promise<boolean> {
    const room = await findRoom({ context: this.context, roomId })

    if (!room) {
      return false
    }

    switch (adapterType) {
      case "playback":
        return !!room.playbackControllerId
      case "metadata":
        return !!room.metadataSourceIds?.length
      case "media":
        return !!room.mediaSourceId
      default:
        return false
    }
  }
}
