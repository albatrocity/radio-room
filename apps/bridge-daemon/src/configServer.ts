import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { createClient, type RedisClientType } from "redis"
import {
  bridgeDaemonConfigSchema,
  configPath,
  loadConfig,
  saveConfig,
  type BridgeDaemonConfig,
} from "./config"
import { listRoomsFromRedis } from "./listRooms"

type RedisLike = RedisClientType<any, any, any>

export type ConfigServerHandlers = {
  getStatus: () => {
    connected: boolean
    roomId: string | null
    drivers: string[]
    spotifyDeviceId: string | null
  }
  connect: (roomId: string) => Promise<void>
  disconnect: () => Promise<void>
  /** Reload in-memory config after a save (caller may restart session). */
  onConfigSaved: (config: BridgeDaemonConfig) => void
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const UI_HTML_PATH = join(__dirname, "..", "ui", "index.html")

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const data = JSON.stringify(body)
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
  })
  res.end(data)
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on("data", (c) => chunks.push(c))
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    req.on("error", reject)
  })
}

async function withRedis<T>(
  redisUrl: string,
  fn: (redis: RedisLike) => Promise<T>,
): Promise<T> {
  const redis = createClient({ url: redisUrl })
  redis.on("error", (err) => console.error("[config-server redis]", err))
  await redis.connect()
  try {
    return await fn(redis as RedisLike)
  } finally {
    await redis.quit().catch(() => {})
  }
}

export function startConfigServer(
  listen: string,
  handlers: ConfigServerHandlers,
): Server {
  const [host, portStr] = listen.includes(":")
    ? (() => {
        const idx = listen.lastIndexOf(":")
        return [listen.slice(0, idx), listen.slice(idx + 1)] as const
      })()
    : (["127.0.0.1", listen] as const)
  const port = Number(portStr)
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid httpListen: ${listen}`)
  }

  const server = createServer(async (req, res) => {
    try {
      await handleRequest(req, res, handlers)
    } catch (e) {
      console.error("[config-server]", e)
      sendJson(res, 500, {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  })

  server.listen(port, host, () => {
    console.log(`[config-ui] http://${host}:${port}/`)
  })

  return server
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  handlers: ConfigServerHandlers,
) {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`)
  const path = url.pathname
  const method = req.method ?? "GET"

  if (method === "GET" && (path === "/" || path === "/index.html")) {
    const html = readFileSync(UI_HTML_PATH, "utf8")
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
    res.end(html)
    return
  }

  if (method === "GET" && path === "/api/config") {
    sendJson(res, 200, { ok: true, config: loadConfig(), configPath: configPath() })
    return
  }

  if (method === "PUT" && path === "/api/config") {
    const raw = await readBody(req)
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid JSON" })
      return
    }
    const result = bridgeDaemonConfigSchema.safeParse(parsed)
    if (!result.success) {
      sendJson(res, 400, {
        ok: false,
        error: result.error.message,
      })
      return
    }
    saveConfig(result.data)
    handlers.onConfigSaved(result.data)
    sendJson(res, 200, { ok: true, config: result.data })
    return
  }

  if (method === "GET" && path === "/api/status") {
    sendJson(res, 200, { ok: true, ...handlers.getStatus() })
    return
  }

  if (method === "GET" && path === "/api/rooms") {
    const config = loadConfig()
    try {
      const rooms = await withRedis(config.redisUrl, (redis) => listRoomsFromRedis(redis))
      sendJson(res, 200, { ok: true, rooms })
    } catch (e) {
      sendJson(res, 502, {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        rooms: [],
      })
    }
    return
  }

  if (method === "POST" && path === "/api/connect") {
    const raw = await readBody(req)
    let roomId = ""
    try {
      const body = JSON.parse(raw || "{}") as { roomId?: string }
      roomId = (body.roomId ?? "").trim()
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid JSON" })
      return
    }
    if (!roomId) {
      sendJson(res, 400, { ok: false, error: "roomId is required" })
      return
    }
    await handlers.connect(roomId)
    sendJson(res, 200, { ok: true, ...handlers.getStatus() })
    return
  }

  if (method === "POST" && path === "/api/disconnect") {
    await handlers.disconnect()
    sendJson(res, 200, { ok: true, ...handlers.getStatus() })
    return
  }

  sendJson(res, 404, { ok: false, error: "Not found" })
}
