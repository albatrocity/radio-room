import {
  CreateServerConfig,
  PlaybackController,
  PlaybackControllerAuthentication,
  PlaybackControllerAdapter,
  PlaybackControllerLifecycleCallbacks,
  RadioRoomServer,
} from "@repo/types"

export async function createServer(config: CreateServerConfig): Promise<RadioRoomServer> {
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

  return {
    playbackControllers: controllers,
    mediaSources: [],
    jobs: [],
    cache: {
      get: async (key) => {},
      registerPlaybackController: async ({ adapter, config }) => {
        return adapter.register({
          authentication: config.authentication,
          name: config.name,
          ...lifecycleCallbacks,
        })
      },
      registerMediaSource: async (config) => {
        // Implement your media source registration logic here
        return {
          name: config.name,
          authentication: config.authentication,
        }
      },
      registerJob: async (job) => {
        // Implement your job registration logic here
        return job
      },
      start: async () => {
        // Implement your server start logic here
      },
      stop: async () => {
        // Implement your server stop logic here
      },
    },
  }
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
  onRegistered: async ({ api, name }: { api: PlaybackController["api"]; name: string }) => {
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
