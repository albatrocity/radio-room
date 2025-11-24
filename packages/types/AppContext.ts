import type { RedisClientType } from "redis"
import type { PlaybackController, PlaybackControllerAdapter } from "./PlaybackController"
import type { MetadataSource, MetadataSourceAdapter } from "./MetadataSource"
import type { MediaSource, MediaSourceAdapter } from "./MediaSource"
import type { JobRegistration } from "./JobRegistration"
import type { ServiceAuthenticationAdapter, ServiceAuthenticationTokens } from "./ServiceAuthentication"

export type { RedisClientType } from "redis"

export interface AppContext {
  redis: RedisContext
  adapters: AdapterRegistry
  jobs: JobRegistration[]
  jobService?: {
    scheduleJob: (job: JobRegistration) => Promise<void>
    disableJob: (jobName: string) => void
    stop: () => Promise<void>
  }
  data?: {
    getUserServiceAuth: (params: {
      userId: string
      serviceName: string
    }) => Promise<ServiceAuthenticationTokens | null>
    storeUserServiceAuth: (params: {
      userId: string
      serviceName: string
      tokens: ServiceAuthenticationTokens
    }) => Promise<void>
    deleteUserServiceAuth: (params: {
      userId: string
      serviceName: string
    }) => Promise<void>
  }
  // You can add other context dependencies here in the future
  // e.g., logger, metrics, config, etc.
}

export interface AdapterRegistry {
  // Registered adapter instances (the result of calling adapter.register())
  playbackControllers: Map<string, PlaybackController>
  metadataSources: Map<string, MetadataSource>
  mediaSources: Map<string, MediaSource>
  serviceAuth: Map<string, ServiceAuthenticationAdapter>
  
  // Adapter modules themselves (needed for lifecycle hooks like onRoomCreated)
  playbackControllerModules: Map<string, PlaybackControllerAdapter>
  metadataSourceModules: Map<string, MetadataSourceAdapter>
  mediaSourceModules: Map<string, MediaSourceAdapter>
}

export interface RedisContext {
  pubClient: RedisClientType<any, any, any>
  subClient: RedisClientType<any, any, any>
}
