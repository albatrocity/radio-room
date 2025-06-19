import { RedisContext } from "@repo/types"
import { createClient } from "redis"

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
