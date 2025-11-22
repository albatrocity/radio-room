import { createServer } from "@repo/server"
import {
  playbackController,
  metadataSource,
  mediaSource as spotifyMediaSource,
  createSpotifyAuthRoutes,
  createSpotifyServiceAuthAdapter,
} from "@repo/adapter-spotify"
import { mediaSource as shoutcastMediaSource } from "@repo/media-source-shoutcast"

async function main() {
  const server = createServer({
    PORT: Number(process.env.PORT ?? 3000),
    REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
    ENVIRONMENT: (process.env.ENVIRONMENT as "production" | "development") || "development",
    DOMAIN: process.env.ENVIRONMENT === "production" ? ".listeningroom.club" : "localhost",
    onStart: () => {
      console.log("Server started successfully")
    },
  })

  const context = server.getContext()

  // Register Spotify Service Authentication Adapter
  const spotifyServiceAuth = createSpotifyServiceAuthAdapter(context)
  context.adapters.serviceAuth.set("spotify", spotifyServiceAuth)

  // Register Spotify PlaybackController
  // Note: This registers the adapter type, but actual instances will be created
  // per-room with the room creator's credentials via AdapterService
  const spotifyPlaybackController = await playbackController.register({
    name: "spotify",
    authentication: {
      type: "oauth",
      clientId: process.env.SPOTIFY_CLIENT_ID ?? "",
      token: {
        accessToken: "", // Will be set per-room
        refreshToken: "",
      },
      async getStoredTokens() {
        // This is a placeholder for the global registration
        // Actual tokens will be retrieved per-room via AdapterService
        return {
          accessToken: "placeholder",
          refreshToken: "placeholder",
        }
      },
    },
    onRegistered: (params) => {
      console.log(`Playback controller registered: ${params.name}`)
    },
    onAuthenticationCompleted: (response) => {
      console.log("Spotify authentication completed:", response)
    },
    onAuthenticationFailed: (error) => {
      console.error("Spotify authentication failed:", error)
    },
    onAuthorizationCompleted: () => {
      console.log("Spotify authorization completed")
    },
    onAuthorizationFailed: (error) => {
      console.error("Spotify authorization failed:", error)
    },
    onPlay: () => console.log("Playback started"),
    onPause: () => console.log("Playback paused"),
    onChangeTrack: (track) => console.log("Track changed:", track),
    onPlaybackStateChange: (state) => console.log("Playback state changed:", state),
    onPlaybackQueueChange: (queue) => console.log("Playback queue changed"),
    onPlaybackPositionChange: (position) => console.log("Playback position changed:", position),
    onError: (error) => console.error("Playback controller error:", error),
  })

  // Store both the adapter module and the registered instance in context
  context.adapters.playbackControllerModules.set("spotify", playbackController)
  context.adapters.playbackControllers.set("spotify", spotifyPlaybackController)

  // Register Spotify MetadataSource
  // Note: This registers the adapter type, but actual instances will be created
  // per-room with the room creator's credentials via AdapterService
  const spotifyMetadataSource = await metadataSource.register({
    name: "spotify",
    url: "",
    authentication: {
      type: "oauth",
      clientId: process.env.SPOTIFY_CLIENT_ID ?? "",
      token: {
        accessToken: "",
        refreshToken: "",
      },
      async getStoredTokens() {
        // Placeholder for global registration
        return { accessToken: "placeholder", refreshToken: "placeholder" }
      },
    },
    registerJob: server.registerJob.bind(server),
    onRegistered: (params) => {
      console.log(`Metadata source registered: ${params.name}`)
      // Will be set after registration completes
    },
    onAuthenticationCompleted: () => {
      console.log("Spotify metadata source authentication completed")
    },
    onAuthenticationFailed: (error) => {
      console.error("Spotify metadata source authentication failed:", error)
    },
    onSearchResults: (data) => {
      console.log("Spotify search results:", data)
    },
    onError: (error) => {
      console.error("Spotify metadata source error:", error)
    },
  })

  // Store both the adapter module and the registered instance in context
  context.adapters.metadataSourceModules.set("spotify", metadataSource)
  context.adapters.metadataSources.set("spotify", spotifyMetadataSource)

  // Register Spotify MediaSource
  const registeredSpotifyMediaSource = await spotifyMediaSource.register({
    name: "spotify",
    url: "", // Not used for Spotify MediaSource
    authentication: {
      type: "none",
    },
    registerJob: server.registerJob.bind(server),
    onRegistered: (params: { name: string }) => {
      console.log(`Spotify MediaSource registered: ${params.name}`)
    },
    onAuthenticationCompleted: () => {
      console.log("Spotify MediaSource authentication completed")
    },
    onAuthenticationFailed: (error: Error) => {
      console.error("Spotify MediaSource authentication failed:", error)
    },
    onOnline: () => {
      console.log("Spotify MediaSource online")
    },
    onOffline: () => {
      console.log("Spotify MediaSource offline")
    },
    onMediaData: (data: any) => {
      console.log("Spotify MediaSource data:", data)
    },
    onError: (error: Error) => {
      console.error("Spotify MediaSource error:", error)
    },
  })

  // Store both the adapter module and the registered instance in context
  context.adapters.mediaSourceModules.set("spotify", spotifyMediaSource)
  context.adapters.mediaSources.set("spotify", registeredSpotifyMediaSource)

  // Register Shoutcast MediaSource
  const registeredShoutcastMediaSource = await shoutcastMediaSource.register({
    name: "shoutcast",
    url: "", // Will be configured per-room via mediaSourceConfig
    authentication: {
      type: "none",
    },
    registerJob: server.registerJob.bind(server),
    onRegistered: (params: { name: string }) => {
      console.log(`Shoutcast MediaSource registered: ${params.name}`)
    },
    onAuthenticationCompleted: () => {
      console.log("Shoutcast MediaSource authentication completed")
    },
    onAuthenticationFailed: (error: Error) => {
      console.error("Shoutcast MediaSource authentication failed:", error)
    },
    onOnline: () => {
      console.log("Shoutcast MediaSource online")
    },
    onOffline: () => {
      console.log("Shoutcast MediaSource offline")
    },
    onMediaData: (data: any) => {
      console.log("Shoutcast MediaSource data:", data)
    },
    onError: (error: Error) => {
      console.error("Shoutcast MediaSource error:", error)
    },
  })

  // Store both the adapter module and the registered instance in context
  context.adapters.mediaSourceModules.set("shoutcast", shoutcastMediaSource)
  context.adapters.mediaSources.set("shoutcast", registeredShoutcastMediaSource)

  // Mount Spotify auth routes
  const spotifyAuthRouter = createSpotifyAuthRoutes(context)
  server.mountRoutes("/auth/spotify", spotifyAuthRouter)

  await server.start()
}

main().catch((error) => {
  console.error("Error starting server:", error)
  process.exit(1)
})
