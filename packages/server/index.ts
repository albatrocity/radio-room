import { createAdapter } from "@socket.io/redis-adapter"
import cookieParser from "cookie-parser"
import session from "express-session"
import { RedisStore } from "connect-redis"
import cors from "cors"
import express from "express"
import { AppContext } from "@repo/types"
import { createServer as createHttpServer } from "http"
import { Server as SocketIoServer } from "socket.io"
import { CreateServerConfig, PlaybackControllerAdapterConfig, User } from "@repo/types"
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
} from "./controllers/roomsController"

import { createActivityController } from "./controllers/activityController"
import { createAdminController } from "./controllers/adminController"
import { createAuthController, me, logout } from "./controllers/authController"
import { createDJController } from "./controllers/djController"
import { createMessageController } from "./controllers/messageController"
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

class RadioRoomServer {
  private io: SocketIoServer
  sessionStore: RedisStore
  private app: express.Express
  private sessionMiddleware: express.RequestHandler
  private httpServer: ReturnType<typeof createHttpServer>
  private _onStart: () => void = () => {}
  private playbackControllers: CreateServerConfig["playbackControllers"]
  private cacheImplementation: CreateServerConfig["cacheImplementation"]
  private context: AppContext
  private jobService: JobService
  private pluginRegistry: PluginRegistry

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
    this.context = createAppContext(config.REDIS_URL ?? "redis://localhost:6379")

    // Initialize JobService
    this.jobService = new JobService(this.context, this.cacheImplementation)

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
        domain: config.DOMAIN ?? "localhost",
        path: "/",
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

    // Initialize SystemEvents (unified event emission layer)
    // Broadcasts to: Redis PubSub, Socket.IO, and Plugin System
    const { SystemEvents } = await import("./lib/SystemEvents")
    this.context.systemEvents = new SystemEvents(this.context.redis, this.io, this.pluginRegistry)
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
    })

    // Start the HTTP server listening
    this.httpServer.listen(PORT, "0.0.0.0", () => console.log(`Listening on ${PORT}`))
    bindPubSubHandlers(this.io, this.context)

    // Initialize plugins (register them with the registry)
    this.initializePlugins()

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

  initializePlugins() {
    try {
      // Register Playlist Democracy plugin
      const createPlaylistDemocracyPlugin = require("@repo/plugin-playlist-democracy").default
      const playlistDemocracyPlugin = createPlaylistDemocracyPlugin()
      this.pluginRegistry.registerPlugin(playlistDemocracyPlugin)
      
      console.log("Plugins initialized")
    } catch (error) {
      console.error("Failed to initialize plugins:", error)
    }
  }

  getPluginRegistry() {
    return this.pluginRegistry
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

  // Lifecycle methods for playback controllers
  async onPlay() {
    console.log("Playback started")
    // TODO: Emit event to clients
  }
  async onPause() {
    console.log("Playback paused")
    // TODO: Emit event to clients
  }
  async onPlaybackQueueChange() {
    console.log("Playback queue changed")
  }
  async onChangeTrack(track: any) {
    console.log("Track changed", track)
  }
  async onPlaybackPositionChange(position: number) {
    console.log("Playback position changed", position)
  }
  async onPlaybackStateChange(state: string) {
    console.log("Playback state changed", state)
  }
}

export function createServer(config: CreateServerConfig) {
  const radioRoomServer = new RadioRoomServer(config)
  return radioRoomServer
}
