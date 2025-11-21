import { createServer } from "@repo/server"
import {
  playbackController,
  metadataSource,
  createSpotifyAuthRoutes,
  createSpotifyServiceAuthAdapter,
} from "@repo/adapter-spotify"

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

  // Store the registered playback controller in context
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

  // Store the registered metadata source in context
  context.adapters.metadataSources.set("spotify", spotifyMetadataSource)

  // Register Shoutcast MediaSource (example - would be configured per room)
  // This is a placeholder - actual media sources will be registered when rooms are created
  console.log("Shoutcast media source adapter available")

  // Mount Spotify auth routes
  const spotifyAuthRouter = createSpotifyAuthRoutes(context)
  server.mountRoutes("/auth/spotify", spotifyAuthRouter)

  await server.start()
}

main().catch((error) => {
  console.error("Error starting server:", error)
  process.exit(1)
})
