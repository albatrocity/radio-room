import { PlaybackControllerAdapterConfig } from "./PlaybackController"
import { SimpleCache } from "./SimpleCache"

export interface CreateServerConfig {
  playbackControllers?: Array<PlaybackControllerAdapterConfig>
  cacheImplementation?: SimpleCache
  onStart?: () => void
  PORT?: number
  REDIS_URL?: string
  ENVIRONMENT?: "production" | "development"
  DOMAIN?: string
}
