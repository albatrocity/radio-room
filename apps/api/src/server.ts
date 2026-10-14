import { createServer, registerAdapters, createOAuthPlaceholder, noAuth } from "@repo/server"
import {
  playbackController,
  metadataSource as spotifyMetadataSource,
  mediaSource as spotifyMediaSource,
  createSpotifyAuthRoutes,
  createSpotifyServiceAuthAdapter,
} from "@repo/adapter-spotify"
import {
  metadataSource as tidalMetadataSource,
  createTidalAuthRoutes,
  createTidalServiceAuthAdapter,
} from "@repo/adapter-tidal"
import {
  playbackController as bridgePlaybackController,
  youtubeMetadataSource,
  localMetadataSource,
} from "@repo/adapter-bridge"
import { mediaSource as shoutcastMediaSource } from "@repo/media-source-shoutcast"
import { mediaSource as rtmpMediaSource } from "@repo/media-source-rtmp"
import { pluginFactories } from "@repo/plugins"
import { authHandler } from "@repo/auth/server"
import { requireAdmin } from "@repo/auth/middleware"

async function main() {
  const port = Number(process.env.PORT ?? 3000)
  const server = createServer({
    PORT: port,
    REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
    ENVIRONMENT: (process.env.ENVIRONMENT as "production" | "development") || "development",
    DOMAIN: process.env.ENVIRONMENT === "production" ? ".listeningroom.club" : "localhost",
    API_URL: process.env.API_URL ?? `http://127.0.0.1:${port}`,
    platformAuthHandler: {
      path: "/api/auth/*splat",
      handler: authHandler,
    },
    requireAdmin,
    onStart: () => {
      console.log("Server started successfully")
    },
  })

  const spotifyOAuth = createOAuthPlaceholder(process.env.SPOTIFY_CLIENT_ID ?? "")
  const tidalOAuth = createOAuthPlaceholder(process.env.TIDAL_CLIENT_ID ?? "")

  await registerAdapters(server, {
    serviceAuth: [
      { name: "spotify", factory: createSpotifyServiceAuthAdapter },
      { name: "tidal", factory: createTidalServiceAuthAdapter },
    ],

    playbackControllers: [
      { name: "spotify", module: playbackController, authentication: spotifyOAuth },
      { name: "bridge", module: bridgePlaybackController, authentication: noAuth },
    ],

    metadataSources: [
      { name: "spotify", module: spotifyMetadataSource, authentication: spotifyOAuth },
      { name: "tidal", module: tidalMetadataSource, authentication: tidalOAuth },
      { name: "youtube", module: youtubeMetadataSource, authentication: noAuth },
      { name: "local", module: localMetadataSource, authentication: noAuth },
    ],

    mediaSources: [
      { name: "spotify", module: spotifyMediaSource },
      { name: "shoutcast", module: shoutcastMediaSource },
      { name: "rtmp", module: rtmpMediaSource },
    ],

    authRoutes: [
      { path: "/auth/spotify", handler: createSpotifyAuthRoutes },
      { path: "/auth/tidal", handler: createTidalAuthRoutes },
    ],

    plugins: pluginFactories,
  })

  await server.start()
}

main().catch((error) => {
  console.error("Error starting server:", error)
  process.exit(1)
})
