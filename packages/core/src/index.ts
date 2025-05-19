import {
  CreateServerConfig,
  PlaybackController,
  PlaybackControllerAuthentication,
  PlaybackControllerAdapter,
  PlaybackControllerLifecycleCallbacks,
} from "@repo/types"

export async function createServer(config: CreateServerConfig) {
  const { playbackControllers } = config

  const controllers = await Promise.all(
    playbackControllers.map(async (controllerConfig) => {
      const { adapter, authentication, name } = controllerConfig
      return await createPlaybackController({
        adapter,
        authentication,
        name,
      })
    }),
  )
}

export async function createPlaybackController({
  adapter,
  authentication,
  name,
}: {
  adapter: PlaybackControllerAdapter
  authentication: PlaybackControllerAuthentication
  name: string
}): Promise<PlaybackController> {
  return await adapter.register({
    authentication,
    name,
    ...lifecycleCallbacks,
  })
}

const lifecycleCallbacks: PlaybackControllerLifecycleCallbacks = {
  onRegistered: async ({
    api,
    name,
  }: {
    api: PlaybackController["api"]
    name: string
  }) => {
    console.log(`Registered ${name} with API`, api)
  },
  onAuthenticationCompleted: async (response) => {
    console.log("Authentication completed", response)
  },
  onAuthenticationFailed: async (error) => {
    console.error("Authentication failed", error)
  },
  onAuthorizationCompleted: async () => {
    console.log("Authorization completed")
  },
  onAuthorizationFailed: async (error) => {
    console.error("Authorization failed", error)
  },
  onPlay: async () => {
    console.log("Playback started")
  },
  onPause: async () => {
    console.log("Playback paused")
  },
  onChangeTrack: async (track) => {
    console.log("Track changed", track)
  },
  onError: async (error) => {
    console.error("Playback error", error)
  },
  onPlaybackStateChange: async (state) => {
    console.log("Playback state changed", state)
  },
  onPlaybackQueueChange: async (queue) => {
    console.log("Playback queue changed", queue)
  },
  onPlaybackPositionChange: async (position) => {
    console.log("Playback position changed", position)
  },
}
