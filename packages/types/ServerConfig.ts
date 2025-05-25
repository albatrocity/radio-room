import { PlaybackControllerRegistrationConfig } from "./PlaybackController"
import { SimpleCache } from "./SimpleCache"

export interface CreateServerConfig {
  playbackControllers: Array<PlaybackControllerRegistrationConfig>
  cacheImplementation: SimpleCache
}
