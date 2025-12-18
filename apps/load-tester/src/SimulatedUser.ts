import { io, Socket } from "socket.io-client"
import { logger } from "./utils/logger.js"
import { randomUsername, randomUserId, randomMessage, pickRandom } from "./utils/random.js"
import { DEFAULT_EMOJIS } from "./config/defaults.js"

export interface UserConfig {
  target: string
  roomId: string
  password?: string
  username?: string
  userId?: string
}

export interface SimulatedUserEvents {
  onConnected?: (user: SimulatedUser) => void
  onDisconnected?: (user: SimulatedUser, reason: string) => void
  onError?: (user: SimulatedUser, error: Error) => void
  onActionComplete?: (user: SimulatedUser, action: string, success: boolean, error?: string) => void
}

interface ServerEvent {
  type: string
  data?: unknown
}

export class SimulatedUser {
  readonly username: string
  readonly userId: string
  readonly roomId: string

  private socket: Socket | null = null
  private connected: boolean = false
  private initialized: boolean = false
  private target: string
  private password?: string
  private events: SimulatedUserEvents

  // Track received data for reactions
  private receivedMessages: Array<{ id: string; timestamp: string }> = []
  private currentTrackId: string | null = null

  constructor(config: UserConfig, events: SimulatedUserEvents = {}) {
    this.target = config.target
    this.roomId = config.roomId
    this.password = config.password
    this.username = config.username || randomUsername()
    this.userId = config.userId || randomUserId()
    this.events = events
  }

  get isConnected(): boolean {
    return this.connected
  }

  get isInitialized(): boolean {
    return this.initialized
  }

  get logContext(): string {
    return this.username
  }

  /**
   * Connect to the server and join the room
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.debug(`Connecting to ${this.target}...`, this.logContext)

      this.socket = io(this.target, {
        transports: ["websocket", "polling"],
        reconnectionAttempts: 3,
        timeout: 10000,
        autoConnect: true,
      })

      const connectionTimeout = setTimeout(() => {
        if (!this.connected) {
          this.socket?.disconnect()
          reject(new Error("Connection timeout"))
        }
      }, 15000)

      this.socket.on("connect", () => {
        this.connected = true
        logger.debug("Socket connected, logging in...", this.logContext)

        // Send login event
        this.socket?.emit("LOGIN", {
          username: this.username,
          userId: this.userId,
          roomId: this.roomId,
          password: this.password,
        })
      })

      this.socket.on("event", (event: ServerEvent) => {
        this.handleServerEvent(event, resolve, reject, connectionTimeout)
      })

      this.socket.on("disconnect", (reason) => {
        this.connected = false
        this.initialized = false
        logger.debug(`Disconnected: ${reason}`, this.logContext)
        this.events.onDisconnected?.(this, reason)
      })

      this.socket.on("connect_error", (error) => {
        clearTimeout(connectionTimeout)
        logger.error(`Connection error: ${error.message}`, this.logContext)
        this.events.onError?.(this, error)
        reject(error)
      })
    })
  }

  private handleServerEvent(
    event: ServerEvent,
    resolve: () => void,
    reject: (error: Error) => void,
    connectionTimeout: NodeJS.Timeout
  ) {
    switch (event.type) {
      case "INIT":
        this.initialized = true
        clearTimeout(connectionTimeout)
        logger.success("Joined room successfully", this.logContext)
        this.events.onConnected?.(this)
        resolve()
        break

      case "ERROR_OCCURRED":
        clearTimeout(connectionTimeout)
        const errorData = event.data as { message?: string }
        const errorMsg = errorData?.message || "Unknown error"
        logger.error(`Server error: ${errorMsg}`, this.logContext)
        reject(new Error(errorMsg))
        break

      case "UNAUTHORIZED":
        clearTimeout(connectionTimeout)
        logger.error("Unauthorized - password required or incorrect", this.logContext)
        reject(new Error("Unauthorized"))
        break

      case "MESSAGE_RECEIVED":
        // Track received messages for reactions
        const msgData = event.data as { roomId: string; message: { timestamp: string } }
        if (msgData?.message?.timestamp) {
          this.receivedMessages.push({
            id: msgData.message.timestamp, // Using timestamp as message ID
            timestamp: msgData.message.timestamp,
          })
          // Keep only last 50 messages
          if (this.receivedMessages.length > 50) {
            this.receivedMessages.shift()
          }
        }
        break

      case "NOW_PLAYING_CHANGED":
        // Track current track for reactions
        const npData = event.data as { meta?: { nowPlaying?: { track?: { id: string } } } }
        if (npData?.meta?.nowPlaying?.track?.id) {
          this.currentTrackId = npData.meta.nowPlaying.track.id
        }
        break

      default:
        logger.debug(`Received event: ${event.type}`, this.logContext)
    }
  }

  /**
   * Disconnect from the server
   */
  async disconnect(): Promise<void> {
    if (this.socket) {
      // Emit USER_LEFT before disconnecting
      this.socket.emit("USER_LEFT")
      await new Promise((resolve) => setTimeout(resolve, 100))
      this.socket.disconnect()
      this.socket = null
      this.connected = false
      this.initialized = false
      logger.debug("Disconnected", this.logContext)
    }
  }

  /**
   * Send a chat message
   */
  async sendMessage(content?: string): Promise<void> {
    if (!this.socket || !this.initialized) {
      throw new Error("Not connected")
    }

    const message = content || randomMessage()
    logger.debug(`Sending message: ${message}`, this.logContext)

    try {
      this.socket.emit("SEND_MESSAGE", message)
      this.events.onActionComplete?.(this, "sendMessage", true)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error"
      this.events.onActionComplete?.(this, "sendMessage", false, errorMsg)
      throw error
    }
  }

  /**
   * Add a song to the queue
   */
  async queueSong(trackId: string): Promise<void> {
    if (!this.socket || !this.initialized) {
      throw new Error("Not connected")
    }

    logger.debug(`Queueing song: ${trackId}`, this.logContext)

    try {
      this.socket.emit("QUEUE_SONG", trackId)
      this.events.onActionComplete?.(this, "queueSong", true)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error"
      this.events.onActionComplete?.(this, "queueSong", false, errorMsg)
      throw error
    }
  }

  /**
   * Add a reaction to a message or track
   */
  async addReaction(targetType: "message" | "track", emojiNative?: string): Promise<void> {
    if (!this.socket || !this.initialized) {
      throw new Error("Not connected")
    }

    // Pick a random emoji from defaults
    const emoji = pickRandom(DEFAULT_EMOJIS)
    const targetId = targetType === "message" ? this.getRandomMessageId() : this.currentTrackId

    if (!targetId) {
      logger.debug(`No ${targetType} to react to`, this.logContext)
      return
    }

    const reaction = {
      emoji: {
        id: emoji.id,
        name: emoji.name,
        native: emojiNative || emoji.native,
        shortcodes: emoji.shortcodes,
        keywords: emoji.keywords,
      },
      reactTo: {
        type: targetType,
        id: targetId,
      },
      user: {
        userId: this.userId,
        username: this.username,
        displayName: this.username,
      },
    }

    logger.debug(`Adding reaction ${emoji.native} to ${targetType}:${targetId}`, this.logContext)

    try {
      this.socket.emit("ADD_REACTION", reaction)
      this.events.onActionComplete?.(this, "addReaction", true)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error"
      this.events.onActionComplete?.(this, "addReaction", false, errorMsg)
      throw error
    }
  }

  /**
   * Start typing indicator
   */
  async startTyping(): Promise<void> {
    if (!this.socket || !this.initialized) return
    this.socket.emit("START_TYPING")
  }

  /**
   * Stop typing indicator
   */
  async stopTyping(): Promise<void> {
    if (!this.socket || !this.initialized) return
    this.socket.emit("STOP_TYPING")
  }

  private getRandomMessageId(): string | null {
    if (this.receivedMessages.length === 0) return null
    return pickRandom(this.receivedMessages).id
  }
}

