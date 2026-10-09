import { loadConfig } from "./config.js"
import { NowPlayingController } from "./nowPlaying.js"
import { startRedisNowPlayingSubscriber } from "./redisNowPlaying.js"
import { createStreamServer, listen } from "./streamServer.js"

async function main(): Promise<void> {
  const config = loadConfig()
  const nowPlaying = new NowPlayingController(config.fallbackRotateMs)
  nowPlaying.start()

  const stream = createStreamServer({
    host: config.host,
    port: config.port,
    mp3Path: config.mp3Path,
    metaint: config.metaint,
    bitrateKbps: config.bitrateKbps,
    nowPlaying,
  })

  await listen(stream, config.host, config.port)

  let redisStop: (() => Promise<void>) | null = null
  try {
    const sub = await startRedisNowPlayingSubscriber({
      redisUrl: config.redisUrl,
      roomId: config.roomId,
      onTrack: (meta, roomId) => {
        nowPlaying.setTrack(meta, "bridge")
        console.log(
          `[dev-radio] bridge now-playing${roomId ? ` room=${roomId}` : ""}: ${nowPlaying.getSnapshot().streamTitle}`,
        )
      },
    })
    redisStop = sub.stop
  } catch (err) {
    console.warn(
      "[dev-radio] Redis subscribe failed; continuing with fallback rotation only:",
      err instanceof Error ? err.message : err,
    )
  }

  console.log(`[dev-radio] listening on ${stream.streamUrl}`)
  console.log(
    `[dev-radio] now playing: ${nowPlaying.getSnapshot().streamTitle} (${nowPlaying.getSnapshot().source})`,
  )
  console.log(
    "[dev-radio] room wiring: radioProtocol=raw; " +
      `radioMetaUrl=<api-reachable>/stream; radioListenUrl=<browser-reachable>/stream`,
  )

  const shutdown = async (signal: string) => {
    console.log(`[dev-radio] shutting down (${signal})`)
    nowPlaying.stop()
    if (redisStop) await redisStop()
    await stream.close()
    process.exit(0)
  }

  process.on("SIGINT", () => void shutdown("SIGINT"))
  process.on("SIGTERM", () => void shutdown("SIGTERM"))
}

main().catch((err) => {
  console.error("[dev-radio] fatal:", err)
  process.exit(1)
})
