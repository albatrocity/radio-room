import { AdapterAuthentication } from "./Adapter"
import type { MetadataSourceTrack } from "./MetadataSource"

export type PlaybackControllerAuthenticationResponse = {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

export type PlaybackState = "playing" | "paused" | "stopped"

export type PlaybackControllerQueueItem = MetadataSourceTrack

export interface PlaybackController {
  name: string
  authentication: AdapterAuthentication
  api: PlaybackControllerApi
}

export interface PlaybackControllerApi {
  getPlayback: () => Promise<{
    state: PlaybackState
    track: PlaybackControllerQueueItem | null
  }>
  play: () => Promise<void>
  pause: () => Promise<void>
  seekTo: (position: number) => Promise<void>
  skipToNextTrack: () => Promise<PlaybackControllerQueueItem[]>
  skipToPreviousTrack: () => Promise<PlaybackControllerQueueItem[]>
  getQueue: () => Promise<PlaybackControllerQueueItem[]>
  addToQueue: (mediaId: string, position?: number) => Promise<PlaybackControllerQueueItem[]>
  removeFromQueue?: (mediaId: string) => Promise<PlaybackControllerQueueItem[]>
  clearQueue?: () => Promise<PlaybackControllerQueueItem[]>
}

export type PlaybackControllerLifecycleCallbacks = {
  name: string
  authentication: AdapterAuthentication
  onRegistered: (params: { api: PlaybackControllerApi; name: string }) => void
  onAuthenticationCompleted: (response?: PlaybackControllerAuthenticationResponse) => void
  onAuthenticationFailed: (error: Error) => void
  onAuthorizationCompleted: () => void
  onAuthorizationFailed: (error: Error) => void
  onPlay: () => void
  onPause: () => void
  onChangeTrack: (track: PlaybackControllerQueueItem) => void
  onError: (error: Error) => void
  onPlaybackStateChange: (state: PlaybackState) => void
  onPlaybackQueueChange: (queue: PlaybackControllerQueueItem[]) => void
  onPlaybackPositionChange: (position: number) => void
}

export interface PlaybackControllerAdapterConfig {
  name: string
  authentication: AdapterAuthentication
  adapter: PlaybackControllerAdapter
}

export interface PlaybackControllerAdapter {
  register: (config: PlaybackControllerLifecycleCallbacks) => Promise<PlaybackController>
}
