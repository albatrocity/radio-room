import { createClient } from "redis"
import { Command } from "commander"
import {
  loadConfig,
  saveConfig,
  configPath,
  defaultNowPlayingPath,
  type BridgeDaemonConfig,
} from "./config"
import { ChromeManager } from "./chrome"
import { YoutubeDriver } from "./drivers/youtube"
import { LocalDriver } from "./drivers/local"
import { TidalDriver } from "./drivers/tidal"
import type { Driver } from "./drivers/Driver"
import { NowPlayingPublisher } from "./nowPlaying"
import { Presence } from "./presence"
import { Router } from "./router"
import { RpcServer } from "./rpcServer"

type Session = {
  roomId: string
  redis: ReturnType<typeof createClient>
  presence: Presence
  rpc: RpcServer
  drivers: Map<string, Driver>
  chrome: ChromeManager | null
}

let session: Session | null = null

async function connect(roomId: string, config: BridgeDaemonConfig) {
  if (session) {
    console.log(`Already connected to room ${session.roomId}; disconnecting first…`)
    await disconnect()
  }

  const redis = createClient({ url: config.redisUrl })
  redis.on("error", (err) => console.error("[redis]", err))
  await redis.connect()

  const drivers = new Map<string, Driver>()
  let chrome: ChromeManager | null = null
  let localDriver: LocalDriver | null = null

  if (config.services.includes("youtube")) {
    chrome = new ChromeManager(config.chrome)
    const yt = new YoutubeDriver(chrome)
    await yt.start()
    drivers.set("youtube", yt)
  }

  if (config.services.includes("local")) {
    localDriver = new LocalDriver(config.navidrome, config.mpv)
    try {
      await localDriver.start()
      drivers.set("local", localDriver)
    } catch (e) {
      console.warn("[local] mpv/Navidrome start failed — local playback unavailable:", e)
      localDriver = null
    }
  }

  if (config.services.includes("tidal")) {
    const tidal = new TidalDriver(config.tidal)
    try {
      await tidal.start()
      drivers.set("tidal", tidal)
    } catch (e) {
      console.warn("[tidal] start failed — Tidal unavailable:", e)
    }
  }

  const nowPlayingPath = config.nowPlayingPath ?? defaultNowPlayingPath()
  const nowPlaying = new NowPlayingPublisher(redis as any, nowPlayingPath, config.nowPlayingFormat)
  const presence = new Presence(redis as any, roomId)
  const router = new Router(drivers, presence, nowPlaying, roomId)
  const rpc = new RpcServer(redis as any, roomId, router, localDriver)

  await presence.start(Array.from(drivers.keys()))
  await rpc.start()

  session = { roomId, redis: redis as any, presence, rpc, drivers, chrome }
  console.log(`Connected to room ${roomId}`)
  console.log(`  services: ${Array.from(drivers.keys()).join(", ") || "(none)"}`)
  console.log(`  Now Playing file: ${nowPlayingPath}`)
  console.log(`  Config: ${configPath()}`)
}

async function disconnect() {
  if (!session) {
    console.log("Not connected")
    return
  }
  const s = session
  session = null
  await s.presence.disconnecting()
  await s.rpc.stop()
  for (const d of Array.from(s.drivers.values())) {
    await d.stop().catch(() => {})
  }
  await s.chrome?.close().catch(() => {})
  await s.redis.quit().catch(() => {})
  console.log(`Disconnected from room ${s.roomId}`)
}

async function status() {
  if (!session) {
    console.log("Status: disconnected")
    return
  }
  console.log(`Status: connected to room ${session.roomId}`)
  console.log(`  drivers: ${Array.from(session.drivers.keys()).join(", ")}`)
}

const program = new Command()
program.name("bridge-daemon").description("Listening Room media bridge daemon")

program
  .command("connect")
  .option("-r, --room <roomId>", "Room id to connect to")
  .action(async (opts: { room?: string }) => {
    const config = loadConfig()
    const roomId = opts.room ?? config.defaultRoomId
    if (!roomId) {
      console.error("Pass --room <id> or set defaultRoomId in config.json")
      process.exit(1)
    }
    if (opts.room && opts.room !== config.defaultRoomId) {
      saveConfig({ ...config, defaultRoomId: opts.room })
    }
    await connect(roomId, config)
    // Keep process alive
    process.on("SIGINT", () => {
      void disconnect().then(() => process.exit(0))
    })
    process.on("SIGTERM", () => {
      void disconnect().then(() => process.exit(0))
    })
  })

program.command("disconnect").action(async () => {
  await disconnect()
  process.exit(0)
})

program.command("status").action(async () => {
  await status()
  process.exit(0)
})

program.command("init-config").action(() => {
  const config = loadConfig()
  saveConfig(config)
  console.log(`Wrote ${configPath()}`)
})

// Default: show help if no command
if (process.argv.length <= 2) {
  program.help()
} else {
  program.parse()
}
