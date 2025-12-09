import { AppContext, RedisContext } from "@repo/types"
import { createClient } from "redis"
import {
  getUserServiceAuth,
  storeUserServiceAuth,
  deleteUserServiceAuth,
} from "../operations/data/serviceAuthentications"

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

export interface CreateAppContextOptions {
  redisUrl: string
  apiUrl?: string
}

export function createAppContext(options: CreateAppContextOptions): AppContext {
  const { redisUrl, apiUrl } = options
  const context: AppContext = {
    redis: createRedisContext(redisUrl),
    adapters: {
      playbackControllers: new Map(),
      metadataSources: new Map(),
      mediaSources: new Map(),
      serviceAuth: new Map(),
      playbackControllerModules: new Map(),
      metadataSourceModules: new Map(),
      mediaSourceModules: new Map(),
    },
    jobs: [],
    apiUrl,
    data: {
      getUserServiceAuth: async ({ userId, serviceName }) => {
        return getUserServiceAuth({ context, userId, serviceName })
      },
      storeUserServiceAuth: async ({ userId, serviceName, tokens }) => {
        return storeUserServiceAuth({ context, userId, serviceName, tokens })
      },
      deleteUserServiceAuth: async ({ userId, serviceName }) => {
        return deleteUserServiceAuth({ context, userId, serviceName })
      },
    },
  }
  return context
}

export async function initializeRedisContext(context: RedisContext): Promise<void> {
  await context.pubClient.connect()
  await context.subClient.connect()
}

export async function cleanupRedisContext(context: RedisContext): Promise<void> {
  await context.pubClient.quit()
  await context.subClient.quit()
}
