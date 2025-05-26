import { createServer } from "@repo/server"
import { playbackController } from "@repo/adapter-spotify"

async function main() {
  const spotifyPlayback = await playbackController.register({
    authentication: {
      type: "oauth",
      clientId: process.env.SPOTIFY_CLIENT_ID ?? "",
      token: {
        accessToken: process.env.SPOTIFY_ACCESS_TOKEN ?? "",
        refreshToken: process.env.SPOTIFY_REFRESH_TOKEN ?? "",
      },
      async getStoredTokens() {
        return {
          accessToken: "",
          refreshToken: "",
        }
      },
    },
    name: "Spotify",
  })

  const server = createServer({
    PORT: Number(process.env.PORT ?? 3000),
    REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
    ENVIRONMENT: process.env.ENVIRONMENT as "production" | "development",
    DOMAIN: process.env.ENVIRONMENT === "production" ? ".listeningroom.club" : "localhost",
    onStart: async () => {
      // Any additional startup logic can go here
      console.log("Server started successfully")
    },
    playbackControllers: [spotifyPlayback],
  })

  await server.start()
}
main().catch((error) => {
  console.error("Error starting server:", error)
  process.exit(1)
})
