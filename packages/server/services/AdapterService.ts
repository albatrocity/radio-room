import {
  AppContext,
  PlaybackController,
  MetadataSource,
  MediaSource,
  StoredTokens,
} from "@repo/types"
import { findRoom } from "../operations/data"
import { handlePlaybackStateChange } from "../operations/playback/handlePlaybackStateChange"

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
  /** Tracks which service is cached under the primary `roomId` key (not `:pc:` delegates). */
  private roomPrimaryPlaybackService: Map<string, string> = new Map()
  private roomMetadataSources: Map<string, MetadataSource> = new Map()

  constructor(context: AppContext) {
    this.context = context
  }

  /**
   * Drop cached playback controllers for a room (primary + `:pc:` delegates).
   * Call when `playbackControllerId` changes at runtime.
   */
  clearRoomPlaybackControllerCache(roomId: string) {
    this.roomPlaybackControllers.delete(roomId)
    this.roomPrimaryPlaybackService.delete(roomId)
    for (const key of Array.from(this.roomPlaybackControllers.keys())) {
      if (key.startsWith(`${roomId}:pc:`)) {
        this.roomPlaybackControllers.delete(key)
      }
    }
  }

  /**
   * Load room-creator OAuth tokens, refreshing when expired or near expiry.
   * Used by playback controllers (and mirrors metadata-source refresh behavior).
   */
  private async getCreatorServiceTokensWithRefresh(params: {
    creatorUserId: string
    serviceName: string
    /** Skip expiresAt check and always refresh (e.g. after Spotify 401). */
    force?: boolean
  }): Promise<StoredTokens> {
    const { creatorUserId, serviceName, force = false } = params

    if (!this.context.data?.getUserServiceAuth) {
      throw new Error("getUserServiceAuth not available in context")
    }

    const auth = await this.context.data.getUserServiceAuth({
      userId: creatorUserId,
      serviceName,
    })

    if (!auth || !auth.accessToken) {
      throw new Error(`No auth tokens found for room creator ${creatorUserId}`)
    }

    // Missing expiresAt → treat as stale so we don't keep serving dead access tokens.
    const expiresAt = auth.expiresAt ?? 0
    const isExpired = expiresAt === 0 || Date.now() > expiresAt - 5 * 60 * 1000

    if (force || isExpired) {
      console.log(
        `[AdapterService] Token for ${serviceName} ${force ? "force-" : ""}refreshing...`,
      )
      const serviceAuthAdapter = this.context.adapters.serviceAuth.get(serviceName)
      if (serviceAuthAdapter?.refreshAuth) {
        try {
          const refreshed = await serviceAuthAdapter.refreshAuth(creatorUserId)
          console.log(`[AdapterService] Token refreshed for ${serviceName}`)
          return {
            accessToken: refreshed.accessToken,
            refreshToken: refreshed.refreshToken,
            metadata: auth.metadata as Record<string, unknown> | undefined,
          }
        } catch (refreshError) {
          console.error(`[AdapterService] Failed to refresh ${serviceName} token:`, refreshError)
          // Fall through and return stored tokens; the API call may still fail.
        }
      }
    }

    return {
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
      metadata: auth.metadata as Record<string, unknown> | undefined,
    }
  }

  /**
   * Get the PlaybackController for a room (uses room creator's credentials)
   * Creates and caches a room-specific instance with dynamic token fetching
   */
  async getRoomPlaybackController(roomId: string): Promise<PlaybackController | null> {
    const room = await findRoom({ context: this.context, roomId })
    if (!room || !room.playbackControllerId) {
      return null
    }

    const cachedService = this.roomPrimaryPlaybackService.get(roomId)
    if (
      this.roomPlaybackControllers.has(roomId) &&
      cachedService === room.playbackControllerId
    ) {
      return this.roomPlaybackControllers.get(roomId)!
    }

    if (this.roomPlaybackControllers.has(roomId) && cachedService !== room.playbackControllerId) {
      this.clearRoomPlaybackControllerCache(roomId)
    }

    return this.getRoomPlaybackControllerByService(roomId, room.playbackControllerId)
  }

  /**
   * Get (or create) a PlaybackController for a specific service for a room.
   * Used by the bridge composite to obtain the Spotify delegate without recursion.
   */
  async getRoomPlaybackControllerByService(
    roomId: string,
    serviceName: string,
  ): Promise<PlaybackController | null> {
    const cacheKey = serviceName === "bridge" ? roomId : `${roomId}:pc:${serviceName}`
    if (serviceName !== "bridge" && this.roomPlaybackControllers.has(cacheKey)) {
      return this.roomPlaybackControllers.get(cacheKey)!
    }

    const room = await findRoom({ context: this.context, roomId })
    if (!room) {
      return null
    }

    // Primary room controller cache is keyed by roomId only for the room's configured controller
    if (
      serviceName === "bridge" &&
      room.playbackControllerId === "bridge" &&
      this.roomPlaybackControllers.has(roomId) &&
      this.roomPrimaryPlaybackService.get(roomId) === "bridge"
    ) {
      return this.roomPlaybackControllers.get(roomId)!
    }

    const adapterModule = this.context.adapters.playbackControllerModules.get(serviceName)
    if (!adapterModule) {
      console.error(`No adapter module found for playback controller: ${serviceName}`)
      return null
    }

    const lifecycle = {
      onRegistered: () => {},
      onAuthenticationCompleted: () => {},
      onAuthenticationFailed: (error: Error) =>
        console.error("Playback controller authentication failed:", error),
      onAuthorizationCompleted: () => {},
      onAuthorizationFailed: (error: Error) =>
        console.error("Playback controller authorization failed:", error),
      onPlay: () => {
        void handlePlaybackStateChange({ context: this.context, roomId, state: "playing" })
      },
      onPause: () => {
        void handlePlaybackStateChange({ context: this.context, roomId, state: "paused" })
      },
      onChangeTrack: () => {},
      onPlaybackStateChange: (state: "playing" | "paused" | "stopped") => {
        void handlePlaybackStateChange({ context: this.context, roomId, state })
      },
      onPlaybackQueueChange: () => {},
      onPlaybackPositionChange: () => {},
      onError: (error: Error) => console.error("Playback controller error:", error),
    }

    // Bridge: no OAuth clientId; room-scoped wiring via registerBridgeForRoom
    if (serviceName === "bridge") {
      const { registerBridgeForRoom } = await import("@repo/adapter-bridge")
      const playbackController = await registerBridgeForRoom({
        roomId,
        context: this.context,
        authentication: { type: "none" },
        lifecycle,
      })
      this.roomPlaybackControllers.set(roomId, playbackController)
      this.roomPrimaryPlaybackService.set(roomId, "bridge")
      return playbackController
    }

    const serviceConfig = getServiceConfig(serviceName)
    if (!serviceConfig.clientId) {
      console.error(`No client ID configured for service: ${getServiceName(serviceName)}`)
      return null
    }

    // Create a room-specific adapter instance with dynamic token fetching
    try {
      const playbackController = await adapterModule.register({
        name: serviceName,
        roomId,
        authentication: {
          type: "oauth",
          clientId: serviceConfig.clientId,
          token: {
            accessToken: "",
            refreshToken: "",
          },
          getStoredTokens: async () => {
            return this.getCreatorServiceTokensWithRefresh({
              creatorUserId: room.creator,
              serviceName,
            })
          },
          refreshTokens: async () => {
            return this.getCreatorServiceTokensWithRefresh({
              creatorUserId: room.creator,
              serviceName,
              force: true,
            })
          },
        },
        ...lifecycle,
        // Prefer the bridge Web Playback SDK device when the daemon has advertised one
        // Key shape matches spotifyDeviceKey() in @repo/adapter-bridge/protocol
        getPreferredDeviceId:
          serviceName === "spotify"
            ? async () => {
                try {
                  return (
                    (await this.context.redis.pubClient.get(
                      `bridge:${roomId}:spotify_device`,
                    )) ?? null
                  )
                } catch {
                  return null
                }
              }
            : undefined,
      })

      if (serviceName === room.playbackControllerId) {
        this.roomPlaybackControllers.set(roomId, playbackController)
        this.roomPrimaryPlaybackService.set(roomId, serviceName)
      } else {
        this.roomPlaybackControllers.set(cacheKey, playbackController)
      }

      return playbackController
    } catch (error) {
      // Spotify (and other OAuth controllers) may not be linked yet — callers treat null as unavailable
      console.warn(
        `[AdapterService] Playback controller unavailable for room ${roomId} (${serviceName}):`,
        error instanceof Error ? error.message : error,
      )
      return null
    }
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
      const needsOAuthClient =
        sourceId !== "youtube" && sourceId !== "local" && sourceId !== "bridge"
      if (needsOAuthClient && !serviceConfig.clientId) {
        console.error(`No client ID configured for service: ${getServiceName(sourceId)}`)
        continue
      }

      try {
        // YouTube uses API key (env); local uses bridge RPC — both use type: none auth
        if (sourceId === "youtube" || sourceId === "local") {
          const metadataSource = await adapterModule.register({
            name: sourceId,
            url: "",
            authentication: { type: "none" },
            registerJob: async (job) => {
              if (this.context.jobService) {
                await this.context.jobService.scheduleJob(job)
              }
              return job
            },
            onRegistered: () => {},
            onAuthenticationCompleted: () => {},
            onAuthenticationFailed: () => {},
            onSearchResults: () => {},
            onError: (error) => console.error(`Metadata source ${sourceId} error:`, error),
          })

          // For local: re-wire with room RPC if bridge is available
          if (sourceId === "local") {
            try {
              const { getBridgeRpcClient, registerLocalMetadataForRoom } = await import(
                "@repo/adapter-bridge"
              )
              const rpc = getBridgeRpcClient(roomId)
              if (rpc) {
                const wired = registerLocalMetadataForRoom({
                  roomId,
                  context: this.context,
                  rpc,
                  authentication: { type: "none" },
                })
                this.roomMetadataSources.set(cacheKey, wired)
                sources.set(sourceId, wired)
                continue
              }
            } catch {
              /* fall through to module instance */
            }
          }

          this.roomMetadataSources.set(cacheKey, metadataSource)
          sources.set(sourceId, metadataSource)
          continue
        }

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
                    console.error(
                      `[AdapterService] Failed to refresh ${sourceId} token:`,
                      refreshError,
                    )
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
      console.error(
        `No client ID configured for service: ${getServiceName(primaryMetadataSourceId)}`,
      )
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

    // YouTube (API key) and local (daemon RPC) need no per-user OAuth
    if (sourceType === "youtube" || sourceType === "local") {
      try {
        if (sourceType === "local") {
          const { getBridgeRpcClient, registerLocalMetadataForRoom } = await import(
            "@repo/adapter-bridge"
          )
          const rpc = getBridgeRpcClient(roomId)
          if (rpc) {
            return registerLocalMetadataForRoom({
              roomId,
              context: this.context,
              rpc,
              authentication: { type: "none" },
            })
          }
        }
        return await adapterModule.register({
          name: sourceType,
          url: "",
          authentication: { type: "none" },
          registerJob: () => Promise.resolve({} as any),
          onRegistered: () => {},
          onAuthenticationCompleted: () => {},
          onAuthenticationFailed: () => {},
          onSearchResults: () => {},
          onError: () => {},
        })
      } catch (error) {
        console.error(`Error creating metadata source for ${sourceType}:`, error)
        return null
      }
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
