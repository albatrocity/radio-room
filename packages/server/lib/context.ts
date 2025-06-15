import { createClient } from "redis"
import type { RedisClientType } from "redis"

export interface RedisContext {
  pubClient: RedisClientType<any, any, any>
  subClient: RedisClientType<any, any, any>
}

export interface AppContext {
  redis: RedisContext
  // You can add other context dependencies here in the future
  // e.g., logger, metrics, config, etc.
}

export function createRedisContext(redisUrl: string): RedisContext {
  const pubClient = createClient({
    url: redisUrl,
    socket:
      process.env.NODE_ENV === "production"
        ? {
            tls: true,
            rejectUnauthorized: false,
          }
        : undefined,
  })

  const subClient = pubClient.duplicate()

  return {
    pubClient,
    subClient,
  }
}

export async function initializeRedisContext(context: RedisContext): Promise<void> {
  await context.pubClient.connect()
  await context.subClient.connect()
}

export async function cleanupRedisContext(context: RedisContext): Promise<void> {
  await context.pubClient.quit()
  await context.subClient.quit()
}
