import {
  PlaybackController,
  PlaybackControllerAdapter,
  PlaybackControllerAdapterConfig,
} from "./PlaybackController"
import { MediaSource, MediaSourceAdapterConfig } from "./MediaSource"
import { JobRegistration } from "./JobRegistration"
import { SimpleCache } from "./SimpleCache"

export interface RadioRoomServer {
  playbackControllers: PlaybackController[]
  mediaSources: MediaSource[]
  jobs: JobRegistration[]
  cache: SimpleCache
  registerPlaybackController: ({
    adapter,
    config,
  }: {
    adapter: PlaybackControllerAdapter
    config: PlaybackControllerAdapterConfig
  }) => Promise<PlaybackController>
  registerMediaSource: (config: MediaSourceAdapterConfig) => Promise<MediaSource>
  registerJob: (job: JobRegistration) => Promise<JobRegistration>
  start: () => Promise<void>
  stop: () => Promise<void>
}
