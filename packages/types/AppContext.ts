import type { RedisClientType } from "redis"
import type { PlaybackController } from "./PlaybackController"
import type { MetadataSource } from "./MetadataSource"
import type { MediaSource } from "./MediaSource"
import type { JobRegistration } from "./JobRegistration"

export type { RedisClientType } from "redis"

export interface AppContext {
  redis: RedisContext
  adapters: AdapterRegistry
  jobs: JobRegistration[]
  // You can add other context dependencies here in the future
  // e.g., logger, metrics, config, etc.
}

export interface AdapterRegistry {
  playbackControllers: Map<string, PlaybackController>
  metadataSources: Map<string, MetadataSource>
  mediaSources: Map<string, MediaSource>
}

export interface RedisContext {
  pubClient: RedisClientType<any, any, any>
  subClient: RedisClientType<any, any, any>
}
