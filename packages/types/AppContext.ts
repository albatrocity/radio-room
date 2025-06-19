import type { RedisClientType } from "redis"
export type { RedisClientType } from "redis"

export interface AppContext {
  redis: RedisContext
  // You can add other context dependencies here in the future
  // e.g., logger, metrics, config, etc.
}

export interface RedisContext {
  pubClient: RedisClientType<any, any, any>
  subClient: RedisClientType<any, any, any>
}
