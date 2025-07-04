import { execa } from "execa"
import { createAdapter } from "@socket.io/redis-adapter"
import cookieParser from "cookie-parser"
import session from "express-session"
import { RedisStore } from "connect-redis"
import cors from "cors"
import express from "express"
import { AppContext } from "@repo/types"
import { createServer as createHttpServer } from "http"
import { Server as SocketIoServer } from "socket.io"
import {
  CreateServerConfig,
  PlaybackController,
  PlaybackControllerAdapter,
  PlaybackControllerAdapterConfig,
  PlaybackControllerLifecycleCallbacks,
  User,
} from "@repo/types"
import { createRedisContext, initializeRedisContext } from "./lib/context"
import { createContextMiddleware } from "./lib/contextMiddleware"

import { bindPubSubHandlers } from "./pubSub/handlers"
// import { callback, login } from "./controllers/spotifyAuthController"
import roomsController, {
  create,
  deleteRoom,
  findRoom,
  findRooms,
} from "./controllers/roomsController"

import activityController from "./controllers/activityController"
import adminController from "./controllers/adminController"
import authController, { me, logout } from "./controllers/authController"
import djController from "./controllers/djController"
import messageController from "./controllers/messageController"
import { clearRoomOnlineUsers } from "./operations/data"
import { SocketWithContext } from "./lib/socketWithContext"

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

    // Create Redis context
    const redisContext = createRedisContext(config.REDIS_URL ?? "redis://localhost:6379")
    this.context = {
      redis: redisContext,
    }

    this.sessionStore = new RedisStore({ client: redisContext.pubClient, prefix: "s:" })

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
      // .get("/login", login)
      .post("/logout", logout)
    // .get("/callback", callback)

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

  async start() {
    await initializeRedisContext(this.context.redis)
    this.io.adapter(createAdapter(this.context.redis.pubClient, this.context.redis.subClient))
    this.io.use((socket, next) => {
      // Handle session for socket connections
      /** @ts-ignore */
      this.sessionMiddleware(socket.request, socket.request.res || {}, next)
    })

    // Register and authorize adapters
    this.playbackControllers?.forEach((controller) => {
      this.registerPlaybackController(controller)
      if (controller.authentication) {
        console.log(`Registering playback controller: ${controller.name}`)
      }
    })

    this.io.on("connection", (socket) => {
      // Pass context to controllers
      const socketWithContext: SocketWithContext = Object.assign(socket, { context: this.context })
      authController(socketWithContext, this.io)
      messageController(socketWithContext, this.io)
      activityController(socketWithContext, this.io)
      djController(socketWithContext, this.io)
      adminController(socketWithContext, this.io)
      roomsController(socketWithContext, this.io)
    })

    // Start the HTTP server listening
    this.httpServer.listen(PORT, "0.0.0.0", () => console.log(`Listening on ${PORT}`))
    bindPubSubHandlers(this.io, this.context)

    await this.startJobs()

    this.onStart()
  }

  async stop() {
    await this.context.redis.pubClient.quit()
    await this.context.redis.subClient.quit()
    this.io.close()

    // Close the HTTP server
    this.httpServer.close()
  }

  async startJobs() {
    try {
      // @ts-ignore
      await execa("node", ["dist/jobs/processor.js"]).pipeStdout(process.stdout)
    } catch (e) {
      console.error(e)
    }
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
    // this.onPlayEvents.push(
    //   (params: PlaybackControllerLifecycleCallbacks["onPlay"]) => {
    //     this.io.emit("playback:play", params)
    //   }
    // )
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
