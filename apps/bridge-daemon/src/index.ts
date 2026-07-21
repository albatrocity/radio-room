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
import { StaticHost } from "./staticHost"
import { SpotifyDeviceHost } from "./spotifyDevice"
import { startConfigServer } from "./configServer"

type Session = {
  roomId: string
  redis: ReturnType<typeof createClient>
  presence: Presence
  rpc: RpcServer
  drivers: Map<string, Driver>
  chrome: ChromeManager | null
  staticHost: StaticHost | null
  spotifyDevice: SpotifyDeviceHost | null
}

let session: Session | null = null
/** Latest config used for connect (updated when UI saves). */
let activeConfig: BridgeDaemonConfig = loadConfig()

function getStatus() {
  return {
    connected: !!session,
    roomId: session?.roomId ?? null,
    drivers: session ? Array.from(session.drivers.keys()) : [],
    spotifyDeviceId: session?.spotifyDevice?.getDeviceId() ?? null,
  }
}

async function connect(roomId: string, config: BridgeDaemonConfig = activeConfig) {
  if (session) {
    console.log(`Already connected to room ${session.roomId}; disconnecting first…`)
    await disconnect()
  }

  activeConfig = config
  const redis = createClient({ url: config.redisUrl })
  redis.on("error", (err) => console.error("[redis]", err))
  await redis.connect()

  const drivers = new Map<string, Driver>()
  let chrome: ChromeManager | null = null
  let staticHost: StaticHost | null = null
  let localDriver: LocalDriver | null = null
  let spotifyDevice: SpotifyDeviceHost | null = null

  const needsChrome =
    config.services.includes("youtube") || config.services.includes("spotify")

  if (needsChrome) {
    chrome = new ChromeManager(config.chrome)
    staticHost = new StaticHost()
    await staticHost.start()
  }

  if (config.services.includes("youtube")) {
    if (!chrome || !staticHost) throw new Error("Chrome/StaticHost required for youtube")
    const yt = new YoutubeDriver(chrome, staticHost)
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

  // Spotify SDK device is opt-in via services; not a Driver / not in CAPABILITIES
  if (config.services.includes("spotify")) {
    if (!chrome || !staticHost) throw new Error("Chrome/StaticHost required for spotify")
    spotifyDevice = new SpotifyDeviceHost(chrome, staticHost, redis as any, roomId)
    try {
      await spotifyDevice.start()
    } catch (e) {
      console.warn("[spotify-device] start failed — SDK device unavailable:", e)
      spotifyDevice = null
    }
  }

  const nowPlayingPath = config.nowPlayingPath ?? defaultNowPlayingPath()
  const nowPlaying = new NowPlayingPublisher(redis as any, nowPlayingPath, config.nowPlayingFormat)
  const presence = new Presence(redis as any, roomId)
  const router = new Router(drivers, presence, nowPlaying, roomId, spotifyDevice)
  const rpc = new RpcServer(redis as any, roomId, router, localDriver)

  await presence.start(Array.from(drivers.keys()))
  await rpc.start()

  session = {
    roomId,
    redis: redis as any,
    presence,
    rpc,
    drivers,
    chrome,
    staticHost,
    spotifyDevice,
  }

  if (roomId !== config.defaultRoomId) {
    saveConfig({ ...config, defaultRoomId: roomId })
    activeConfig = { ...config, defaultRoomId: roomId }
  }

  console.log(`Connected to room ${roomId}`)
  console.log(`  drivers: ${Array.from(drivers.keys()).join(", ") || "(none)"}`)
  if (spotifyDevice) {
    console.log(`  spotify SDK device: starting (see [spotify-device] logs)`)
  }
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
  await s.spotifyDevice?.stop().catch(() => {})
  for (const d of Array.from(s.drivers.values())) {
    await d.stop().catch(() => {})
  }
  await s.staticHost?.stop().catch(() => {})
  await s.chrome?.close().catch(() => {})
  await s.redis.quit().catch(() => {})
  console.log(`Disconnected from room ${s.roomId}`)
}

async function status() {
  const s = getStatus()
  if (!s.connected) {
    console.log("Status: disconnected")
    return
  }
  console.log(`Status: connected to room ${s.roomId}`)
  console.log(`  drivers: ${s.drivers.join(", ")}`)
  if (s.spotifyDeviceId || activeConfig.services.includes("spotify")) {
    console.log(`  spotify SDK device: ${s.spotifyDeviceId ?? "(waiting for ready)"}`)
  }
}

function installSignalHandlers() {
  const shutdown = () => {
    void disconnect().then(() => process.exit(0))
  }
  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)
}

function startUiServer() {
  const config = loadConfig()
  activeConfig = config
  return startConfigServer(config.httpListen, {
    getStatus,
    connect: async (roomId) => {
      const cfg = loadConfig()
      activeConfig = cfg
      await connect(roomId, cfg)
    },
    disconnect,
    onConfigSaved: (cfg) => {
      activeConfig = cfg
      console.log(`[config-ui] saved ${configPath()}`)
    },
  })
}

const program = new Command()
program.name("bridge-daemon").description("Listening Room media bridge daemon")

program
  .command("serve")
  .description("Start local config UI (room picker + settings); optionally auto-connect")
  .option("-r, --room <roomId>", "Room id to connect on startup")
  .option("--no-open", "Do not print the UI URL prominently")
  .action(async (opts: { room?: string }) => {
    activeConfig = loadConfig()
    startUiServer()
    const roomId = opts.room ?? activeConfig.defaultRoomId
    if (roomId) {
      try {
        await connect(roomId, activeConfig)
      } catch (e) {
        console.warn("[serve] auto-connect failed:", e)
      }
    } else {
      console.log("No default room — pick one in the UI")
    }
    installSignalHandlers()
  })

program
  .command("connect")
  .option("-r, --room <roomId>", "Room id to connect to")
  .option("--ui", "Also start the local config UI")
  .action(async (opts: { room?: string; ui?: boolean }) => {
    activeConfig = loadConfig()
    const roomId = opts.room ?? activeConfig.defaultRoomId
    if (!roomId) {
      console.error("Pass --room <id>, set defaultRoomId, or run: npm run serve -w bridge-daemon")
      process.exit(1)
    }
    if (opts.ui) startUiServer()
    await connect(roomId, activeConfig)
    installSignalHandlers()
  })

program.command("disconnect").action(async () => {
  await disconnect()
  process.exit(0)
})

program.command("status").action(async () => {
  await status()
  process.exit(0)
})

program.command("rooms").description("List rooms from Redis (same discovery as the UI)").action(async () => {
  const { listRoomsFromRedis } = await import("./listRooms")
  const config = loadConfig()
  const redis = createClient({ url: config.redisUrl })
  await redis.connect()
  try {
    const rooms = await listRoomsFromRedis(redis as any)
    if (!rooms.length) {
      console.log("(no rooms)")
      return
    }
    for (const r of rooms) {
      const mark = r.bridgeReady ? "[bridge]" : `[${r.playbackControllerId || "?"}]`
      console.log(`${mark} ${r.title}  ${r.id}  (${r.type})`)
    }
  } finally {
    await redis.quit()
  }
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
