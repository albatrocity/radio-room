import type { MetadataSourceTrack } from "./MetadataSource"

export type PlaybackControllerAuthentication =
  | { type: "none" }
  | {
      type: "token"
      clientId: string
      getStoredTokens: () => Promise<{
        accessToken: string
        refreshToken: string
      }>
    }

export type PlaybackState = "playing" | "paused" | "stopped"

export type PlaybackControllerQueueItem = MetadataSourceTrack

export interface PlaybackController {
  name: string
  authentication: PlaybackControllerAuthentication
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
  addToQueue: (
    mediaId: string,
    position?: number,
  ) => Promise<PlaybackControllerQueueItem[]>
  removeFromQueue?: (mediaId: string) => Promise<PlaybackControllerQueueItem[]>
  clearQueue?: () => Promise<PlaybackControllerQueueItem[]>
}

export type PlaybackControllerLifecycleCallbacks = {
  onRegistered: (params: { api: PlaybackControllerApi; name: string }) => void
  onAuthenticatedCompleted: () => void
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

export interface PlaybackControllerAdapterConfig
  extends PlaybackControllerLifecycleCallbacks {
  name: string
  authentication: PlaybackControllerAuthentication
}

export interface PlaybackControllerAdapter {
  register: (
    config: PlaybackControllerAdapterConfig,
  ) => Promise<PlaybackController>
}
