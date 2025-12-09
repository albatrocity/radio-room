import { createServer, registerAdapters, createOAuthPlaceholder } from "@repo/server"
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
import { mediaSource as shoutcastMediaSource } from "@repo/media-source-shoutcast"
import createPlaylistDemocracyPlugin from "@repo/plugin-playlist-democracy"
import createSpecialWordsPlugin from "@repo/plugin-special-words"

async function main() {
  const port = Number(process.env.PORT ?? 3000)
  const server = createServer({
    PORT: port,
    REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
    ENVIRONMENT: (process.env.ENVIRONMENT as "production" | "development") || "development",
    DOMAIN: process.env.ENVIRONMENT === "production" ? ".listeningroom.club" : "localhost",
    API_URL: process.env.API_URL ?? `http://localhost:${port}`,
    onStart: () => {
      console.log("Server started successfully")
    },
  })

  const spotifyOAuth = createOAuthPlaceholder(process.env.SPOTIFY_CLIENT_ID ?? "")
  const tidalOAuth = createOAuthPlaceholder(process.env.TIDAL_CLIENT_ID ?? "")

  // Register all adapters and plugins declaratively
  await registerAdapters(server, {
    serviceAuth: [
      { name: "spotify", factory: createSpotifyServiceAuthAdapter },
      { name: "tidal", factory: createTidalServiceAuthAdapter },
    ],

    playbackControllers: [
      { name: "spotify", module: playbackController, authentication: spotifyOAuth },
    ],

    metadataSources: [
      { name: "spotify", module: spotifyMetadataSource, authentication: spotifyOAuth },
      { name: "tidal", module: tidalMetadataSource, authentication: tidalOAuth },
    ],

    mediaSources: [
      { name: "spotify", module: spotifyMediaSource },
      { name: "shoutcast", module: shoutcastMediaSource },
    ],

    authRoutes: [
      { path: "/auth/spotify", handler: createSpotifyAuthRoutes },
      { path: "/auth/tidal", handler: createTidalAuthRoutes },
    ],

    plugins: [createPlaylistDemocracyPlugin, createSpecialWordsPlugin],
  })

  await server.start()
}

main().catch((error) => {
  console.error("Error starting server:", error)
  process.exit(1)
})
