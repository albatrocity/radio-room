import { SimulatedUser, UserConfig, SimulatedUserEvents } from "./SimulatedUser.js"
import { logger } from "./utils/logger.js"
import { MetricsCollector } from "./utils/metrics.js"
import { calculateActionTimes, sleep } from "./utils/random.js"
import type { JoinPattern } from "./config/schema.js"

export interface UserPoolConfig {
  target: string
  roomId: string
  password?: string
  count: number
  joinPattern: JoinPattern
  joinDuration: number // seconds
}

export class UserPool {
  private users: SimulatedUser[] = []
  private config: UserPoolConfig
  private metrics: MetricsCollector
  private events: SimulatedUserEvents

  constructor(config: UserPoolConfig, metrics: MetricsCollector, events: SimulatedUserEvents = {}) {
    this.config = config
    this.metrics = metrics
    this.events = {
      ...events,
      onActionComplete: (user, action, success, error) => {
        this.metrics.record({
          action,
          userId: user.userId,
          timestamp: Date.now(),
          success,
          error,
        })
        events.onActionComplete?.(user, action, success, error)
      },
    }
  }

  get connectedUsers(): SimulatedUser[] {
    return this.users.filter((u) => u.isConnected && u.isInitialized)
  }

  get allUsers(): SimulatedUser[] {
    return this.users
  }

  /**
   * Create and connect all users according to the join pattern
   */
  async spawn(): Promise<void> {
    const { count, joinPattern, joinDuration, target, roomId, password } = this.config
    const joinDurationMs = joinDuration * 1000

    logger.info(`Spawning ${count} users with ${joinPattern} pattern over ${joinDuration}s`)

    // Calculate join times based on pattern
    const joinTimes = calculateActionTimes(
      count,
      joinDurationMs,
      joinPattern === "burst" ? "burst" : "even"
    )

    const startTime = Date.now()

    for (let i = 0; i < count; i++) {
      const userConfig: UserConfig = {
        target,
        roomId,
        password,
      }

      const user = new SimulatedUser(userConfig, this.events)
      this.users.push(user)

      // Wait until it's time to spawn this user
      const targetTime = startTime + joinTimes[i]
      const waitTime = targetTime - Date.now()
      if (waitTime > 0) {
        await sleep(waitTime)
      }

      // Spawn user (don't await - let them connect in parallel)
      this.connectUser(user, i + 1, count)
    }

    // Wait a bit for final connections to complete
    await sleep(2000)

    logger.success(`${this.connectedUsers.length}/${count} users connected`)
  }

  private async connectUser(user: SimulatedUser, index: number, total: number): Promise<void> {
    const startTime = Date.now()
    try {
      await user.connect()
      const duration = Date.now() - startTime
      this.metrics.record({
        action: "connect",
        userId: user.userId,
        timestamp: Date.now(),
        duration,
        success: true,
      })
      logger.debug(`User ${index}/${total} connected in ${duration}ms`, user.logContext)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error"
      this.metrics.record({
        action: "connect",
        userId: user.userId,
        timestamp: Date.now(),
        success: false,
        error: errorMsg,
      })
      logger.error(`User ${index}/${total} failed to connect: ${errorMsg}`)
    }
  }

  /**
   * Execute an action on a random connected user
   */
  async executeOnRandomUser(action: (user: SimulatedUser) => Promise<void>): Promise<void> {
    const connected = this.connectedUsers
    if (connected.length === 0) {
      logger.warn("No connected users available for action")
      return
    }

    const user = connected[Math.floor(Math.random() * connected.length)]
    try {
      await action(user)
    } catch (error) {
      // Error already logged by SimulatedUser
    }
  }

  /**
   * Execute an action on all connected users
   */
  async executeOnAllUsers(action: (user: SimulatedUser) => Promise<void>): Promise<void> {
    const connected = this.connectedUsers
    await Promise.all(
      connected.map(async (user) => {
        try {
          await action(user)
        } catch (error) {
          // Error already logged by SimulatedUser
        }
      })
    )
  }

  /**
   * Disconnect all users
   */
  async disconnectAll(): Promise<void> {
    logger.info(`Disconnecting ${this.users.length} users...`)

    await Promise.all(
      this.users.map(async (user) => {
        try {
          await user.disconnect()
        } catch (error) {
          // Ignore disconnect errors
        }
      })
    )

    this.users = []
    logger.success("All users disconnected")
  }
}

