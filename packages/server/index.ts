import { createAdapter } from "@socket.io/redis-adapter"
import cookieParser from "cookie-parser"
import session from "express-session"
import { RedisStore } from "connect-redis"
import cors from "cors"
import express from "express"
import { createServer as createHttpServer } from "http"
import { Server as SocketIoServer } from "socket.io"
import {
  AppContext,
  CreateServerConfig,
  PlaybackControllerAdapterConfig,
  User,
  Plugin,
} from "@repo/types"
import { createAppContext, initializeRedisContext } from "./lib/context"
import { createContextMiddleware } from "./lib/contextMiddleware"
import { JobService } from "./services/JobService"

import { bindPubSubHandlers } from "./pubSub/handlers"
import {
  createRoomsController,
  create,
  deleteRoom,
  findRoom,
  findRooms,
  findAllRooms,
} from "./controllers/roomsController"

import { createActivityController } from "./controllers/activityController"
import { createAdminController } from "./controllers/adminController"
import { createAuthController, me, logout } from "./controllers/authController"
import { createDJController } from "./controllers/djController"
import { createLobbyController } from "./controllers/lobbyController"
import { createMessageController } from "./controllers/messageController"
import {
  getPluginSchemas,
  getPluginSchema,
  getPluginComponentStates,
  getPluginComponentState,
} from "./controllers/pluginsController"
import { exportRoom } from "./controllers/exportController"
import { getImage } from "./operations/data"
import { clearRoomOnlineUsers } from "./operations/data"
import { SocketWithContext } from "./lib/socketWithContext"
import { PluginRegistry } from "./lib/plugins"

declare module "express-session" {
  interface Session {
    user?: User
    roomId?: string
  }
}

const PORT = Number(process.env.PORT ?? 3000)

export class RadioRoomServer {
  private readonly io: SocketIoServer
  sessionStore: RedisStore
  private readonly app: express.Express
  private readonly sessionMiddleware: express.RequestHandler
  private readonly httpServer: ReturnType<typeof createHttpServer>
  private readonly _onStart: () => void = () => {}
  private readonly playbackControllers: CreateServerConfig["playbackControllers"]
  private readonly cacheImplementation: CreateServerConfig["cacheImplementation"]
  private readonly context: AppContext
  private readonly jobService: JobService
  private pluginRegistry: PluginRegistry
  private pendingPlugins: (() => Plugin)[] = []

  constructor(
    config: CreateServerConfig = {
      cacheImplementation: undefined,
      playbackControllers: [],
      REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
      ENVIRONMENT: process.env.ENVIRONMENT as "production" | "development",
      DOMAIN: "localhost",
    },
  ) {
    this.playbackControllers = config.playbackControllers ?? []
    this.cacheImplementation = config.cacheImplementation ?? {
      get: async () => "null",
      set: async () => undefined,
      clear: async () => undefined,
      delete: async () => undefined,
    }

    // Create context with adapters and jobs
    this.context = createAppContext({
      redisUrl: config.REDIS_URL ?? "redis://localhost:6379",
      apiUrl: config.API_URL,
    })

    // Initialize JobService
    this.jobService = new JobService(this.context)

    // Add jobService to context so it's accessible everywhere
    this.context.jobService = this.jobService

    // PluginRegistry will be initialized in start() after io is created

    this.sessionStore = new RedisStore({ client: this.context.redis.pubClient, prefix: "s:" })

    this.sessionMiddleware = session({
      store: this.sessionStore,
      resave: true, // required: force lightweight session keep alive (touch)
      saveUninitialized: false, // recommended: only save session when data exists
      proxy: true,
      cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year
        secure: config.ENVIRONMENT === "production",
        httpOnly: false,
        // Don't set domain for loopback addresses (127.0.0.1) - let browser handle it
        domain: config.ENVIRONMENT === "production" ? config.DOMAIN : undefined,
        path: "/",
        // SameSite=Lax allows cookies on top-level navigations (like OAuth redirects)
        sameSite: "lax",
      },
      secret: process.env.SESSION_SECRET ?? "secret",
    })

    this.app = express()
      .set("trust proxy", 1)
      .use(express.static(__dirname + "/public"))
      .use(
        cors({
          origin: [
            "http://localhost:8000",
            "http://127.0.0.1:8000", // Loopback address for local dev (Spotify requirement)
            "https://listen.show",
            "https://www.listen.show",
            "https://listeningroom.club",
            "https://www.listeningroom.club",
          ],
          preflightContinue: true,
          credentials: true,
        }),
      )
      .use(express.json())
      .use(cookieParser())
      .use(this.sessionMiddleware)
      .use(createContextMiddleware(this.context))
      .get("/me", me)
      .get("/rooms/", findRooms)
      .get("/rooms/all", findAllRooms)
      .get("/rooms/:id", findRoom)
      .post("/rooms", create)
      .delete("/rooms/:id", deleteRoom)
      .post("/logout", logout)
      .get("/debug/jobs", (req, res) => {
        const status = this.jobService.getJobStatus()
        res.json({
          totalJobs: status.length,
          jobs: status,
        })
      })
      // Plugin schema endpoints
      .get("/api/plugins", getPluginSchemas)
      .get("/api/plugins/:pluginName/schema", getPluginSchema)
      // Plugin component state endpoints
      .get("/api/rooms/:roomId/plugins/components", getPluginComponentStates)
      .get("/api/rooms/:roomId/plugins/:pluginName/components", getPluginComponentState)
      // Room export endpoint
      .get("/api/rooms/:roomId/export", exportRoom)
      // Room image endpoint
      .get("/api/rooms/:roomId/images/:imageId", async (req, res) => {
        const { roomId, imageId } = req.params
        const context = (req as any).context as AppContext

        const imageData = await getImage({ roomId, imageId, context })

        if (!imageData) {
          return res.status(404).json({ error: "Image not found" })
        }

        // Convert base64 to buffer
        const buffer = Buffer.from(imageData.data, "base64")

        // Set appropriate headers
        res.set({
          "Content-Type": imageData.mimeType,
          "Content-Length": buffer.length,
          "Cache-Control": "public, max-age=31536000", // Cache for 1 year
        })

        return res.send(buffer)
      })

    // Create HTTP server from Express app, but don't start listening yet
    this.httpServer = createHttpServer(this.app)

    // Initialize Socket.IO with the HTTP server
    this.io = new SocketIoServer(this.httpServer, {
      connectTimeout: 45000,
      pingTimeout: 60000,
      pingInterval: 25000,
      allowEIO3: false,
    })
  }

  getIO() {
    return this.io
  }

  getHttpServer(): any {
    return this.httpServer
  }

  getContext(): AppContext {
    return this.context
  }

  mountRoutes(path: string, router: any) {
    this.app.use(path, router)
  }

  async start() {
    await initializeRedisContext(this.context.redis)
    this.io.adapter(createAdapter(this.context.redis.pubClient, this.context.redis.subClient))
    this.io.use((socket, next) => {
      // Handle session for socket connections
      /** @ts-ignore */
      this.sessionMiddleware(socket.request, socket.request.res || {}, next)
    })

    // Initialize PluginRegistry now that io is available
    this.pluginRegistry = new PluginRegistry(this.context, this.io)
    this.context.pluginRegistry = this.pluginRegistry
    console.log("PluginRegistry initialized")

    // Register any plugins that were queued via registerAdapters()
    // We pass the factory function so PluginRegistry can create new instances per room
    for (const pluginFactory of this.pendingPlugins) {
      this.pluginRegistry.registerPlugin(pluginFactory)
    }
    this.pendingPlugins = [] // Clear after registration

    // Initialize BroadcasterRegistry and register broadcasters
    const { BroadcasterRegistry, RoomBroadcaster, LobbyBroadcaster } = await import(
      "./lib/broadcasters"
    )
    const broadcasterRegistry = new BroadcasterRegistry()
    broadcasterRegistry.register(new RoomBroadcaster(this.io))
    broadcasterRegistry.register(new LobbyBroadcaster(this.io))
    console.log("BroadcasterRegistry initialized")

    // Initialize SystemEvents (unified event emission layer)
    // Broadcasts to: Redis PubSub, Plugin System, and Broadcasters
    const { SystemEvents } = await import("./lib/SystemEvents")
    this.context.systemEvents = new SystemEvents(
      this.context.redis,
      this.pluginRegistry,
      broadcasterRegistry,
    )
    console.log("SystemEvents initialized")

    this.io.on("connection", (socket) => {
      // Pass context to controllers
      const socketWithContext: SocketWithContext = Object.assign(socket, { context: this.context })

      // All controllers now use the improved HOF pattern with closure
      createAuthController(socketWithContext, this.io)
      createMessageController(socketWithContext, this.io)
      createActivityController(socketWithContext, this.io)
      createDJController(socketWithContext, this.io)
      createAdminController(socketWithContext, this.io)
      createRoomsController(socketWithContext, this.io)
      createLobbyController(socketWithContext)
    })

    // Start the HTTP server listening
    this.httpServer.listen(PORT, "0.0.0.0", () => console.log(`Listening on ${PORT}`))
    bindPubSubHandlers(this.io, this.context)

    // Note: Plugins are now registered via registerAdapters() in the API entry point

    // Register initial system jobs
    await this.registerSystemJobs()

    // Restore adapter jobs for existing rooms
    await this.restoreAdapterJobs()

    // Restore plugin state for existing rooms
    await this.restorePluginState()

    // Start job service
    await this.jobService.start()

    this.onStart()
  }

  /**
   * @deprecated Plugins should now be registered via registerAdapters() in the API entry point
   */
  initializePlugins() {
    // No-op: plugins are now registered via registerAdapters()
    console.log("initializePlugins() is deprecated - use registerAdapters({ plugins: [...] })")
  }

  getPluginRegistry() {
    return this.pluginRegistry
  }

  /**
   * Queue plugins to be registered after start() initializes the PluginRegistry
   */
  setPendingPlugins(plugins: (() => Plugin)[]) {
    this.pendingPlugins = plugins
  }

  async registerSystemJobs() {
    // Register rooms cleanup job
    const roomsJobHandler = (await import("./jobs/rooms/index")).default
    const roomsJob = {
      name: "rooms",
      description: "Maintains rooms - cleanup and token refresh",
      cron: "0 * * * * *", // Every minute
      enabled: true,
      runAt: Date.now(),
      handler: roomsJobHandler,
    }
    this.context.jobs.push(roomsJob)
    console.log("Registered system job: rooms")
  }

  /**
   * Restore adapter jobs for existing rooms after server restart
   * This ensures jukebox polling and other adapter-specific jobs continue running
   */
  async restoreAdapterJobs() {
    try {
      console.log("Restoring adapter jobs for existing rooms...")
      const { findRoom } = await import("./operations/data")

      // Get all room IDs from Redis
      const roomIds = await this.context.redis.pubClient.sMembers("rooms")
      console.log(`Found ${roomIds.length} existing rooms`)

      // Restore jobs for each room
      for (const roomId of roomIds) {
        try {
          const room = await findRoom({ context: this.context, roomId })

          if (!room) {
            console.log(`Room ${roomId} not found, skipping`)
            continue
          }

          // If room has a playback controller, call its onRoomCreated hook
          if (room.playbackControllerId) {
            const adapter = this.context.adapters.playbackControllerModules.get(
              room.playbackControllerId,
            )

            if (adapter?.onRoomCreated) {
              console.log(
                `Restoring ${room.playbackControllerId} PlaybackController jobs for room ${roomId} (${room.type})`,
              )
              await adapter.onRoomCreated({
                roomId,
                userId: room.creator,
                roomType: room.type,
                context: this.context,
              })
            }
          }

          // If room has a media source, call its onRoomCreated hook
          if (room.mediaSourceId) {
            const adapter = this.context.adapters.mediaSourceModules.get(room.mediaSourceId)

            if (adapter?.onRoomCreated) {
              console.log(
                `Restoring ${room.mediaSourceId} MediaSource jobs for room ${roomId} (${room.type})`,
              )
              await adapter.onRoomCreated({
                roomId,
                userId: room.creator,
                roomType: room.type,
                context: this.context,
              })
            }
          }
        } catch (error) {
          console.error(`Error restoring jobs for room ${roomId}:`, error)
        }
      }

      console.log("Adapter jobs restoration complete")
    } catch (error) {
      console.error("Error restoring adapter jobs:", error)
    }
  }

  /**
   * Restore plugin state for existing rooms after server restart
   */
  async restorePluginState() {
    try {
      console.log("Restoring plugin state for existing rooms...")
      const { findRoom } = await import("./operations/data")

      // Get all room IDs from Redis
      const roomIds = await this.context.redis.pubClient.sMembers("rooms")
      console.log(`Found ${roomIds.length} existing rooms`)

      // Sync plugins for each room
      for (const roomId of roomIds) {
        try {
          const room = await findRoom({ context: this.context, roomId })

          if (!room) {
            console.log(`Room ${roomId} not found, skipping`)
            continue
          }

          await this.pluginRegistry.syncRoomPlugins(roomId, room)
        } catch (error) {
          console.error(`Error restoring plugins for room ${roomId}:`, error)
        }
      }

      console.log("Plugin state restoration complete")
    } catch (error) {
      console.error("Error restoring plugin state:", error)
    }
  }

  async stop() {
    // Cleanup all plugins for all rooms
    const roomIds = await this.context.redis.pubClient.sMembers("rooms")
    for (const roomId of roomIds) {
      await this.pluginRegistry.cleanupRoom(roomId)
    }

    await this.jobService.stop()
    await this.context.redis.pubClient.quit()
    await this.context.redis.subClient.quit()
    this.io.close()

    // Close the HTTP server
    this.httpServer.close()
  }

  registerJob(job: any) {
    this.context.jobs.push(job)
    return Promise.resolve(job)
  }

  async onStart() {
    const roomIds = await this.context.redis.pubClient.sMembers("rooms")
    await Promise.all(
      roomIds.map(async (id) => {
        return clearRoomOnlineUsers({ roomId: id, context: this.context })
      }),
    )

    this._onStart()
  }

  async registerPlaybackController(playbackController: PlaybackControllerAdapterConfig) {
    playbackController.adapter.register({
      name: playbackController.name,
      authentication: playbackController.authentication,
      onPlay: this.onPlay.bind(this),
      onPause: this.onPause.bind(this),
      onPlaybackQueueChange: this.onPlaybackQueueChange.bind(this),
      onChangeTrack: this.onChangeTrack.bind(this),
      onPlaybackPositionChange: this.onPlaybackPositionChange.bind(this),
      onPlaybackStateChange: this.onPlaybackStateChange.bind(this),
      onError: (error) => {
        console.error(`Error in playback controller ${playbackController}`, error)
      },
      onAuthenticationCompleted: (response) => {
        console.log(`Authentication completed for ${playbackController.name}`, response)
      },
      onAuthenticationFailed: (error) => {
        console.error(`Authentication failed for ${playbackController.name}`, error)
      },
      onAuthorizationCompleted: () => {
        console.log(`Authorization completed for ${playbackController.name}`)
      },
      onAuthorizationFailed: (error) => {
        console.error(`Authorization failed for ${playbackController.name}`, error)
      },
      onRegistered: (params) => {
        console.log(`Playback controller registered: ${params.name}`)
        this.io.emit("playback:registered", {
          name: params.name,
          api: params.api,
        })
      },
    })
  }
}

export function createServer(config: CreateServerConfig) {
  const radioRoomServer = new RadioRoomServer(config)
  return radioRoomServer
}

export { registerAdapters, createOAuthPlaceholder, noAuth } from "./lib/registerAdapters"
export type { AdapterRegistrationConfig } from "./lib/registerAdapters"
