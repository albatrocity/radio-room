import { createServer, registerAdapters, createOAuthPlaceholder } from "@repo/server"
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

  const spotifyOAuth = createOAuthPlaceholder(process.env.SPOTIFY_CLIENT_ID ?? "")

  // Register all adapters declaratively
  await registerAdapters(server, {
    serviceAuth: [{ name: "spotify", create: createSpotifyServiceAuthAdapter }],

    playbackControllers: [
      { name: "spotify", module: playbackController, authentication: spotifyOAuth },
    ],

    metadataSources: [{ name: "spotify", module: metadataSource, authentication: spotifyOAuth }],

    mediaSources: [
      { name: "spotify", module: spotifyMediaSource },
      { name: "shoutcast", module: shoutcastMediaSource },
    ],

    authRoutes: [{ path: "/auth/spotify", create: createSpotifyAuthRoutes }],
  })

  await server.start()
}

main().catch((error) => {
  console.error("Error starting server:", error)
  process.exit(1)
})
