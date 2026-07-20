import { createServer, type Server } from "node:http"
import { readFileSync, existsSync } from "node:fs"
import { dirname, extname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
}

/**
 * Serves bridge-daemon/static over HTTP so YouTube embeds get a real Origin/Referer.
 * (file:// / about:blank via setContent triggers Error 153.)
 */
export class StaticHost {
  private server: Server | null = null
  private port: number | null = null

  constructor(private readonly preferredPort = 18765) {}

  get baseUrl(): string {
    if (this.port == null) throw new Error("StaticHost not started")
    return `http://127.0.0.1:${this.port}`
  }

  async start(): Promise<string> {
    if (this.server && this.port != null) return this.baseUrl

    const root = join(__dirname, "../static")

    this.server = createServer((req, res) => {
      const urlPath = (req.url ?? "/").split("?")[0] || "/"
      const rel = urlPath === "/" ? "/youtube.html" : urlPath
      const filePath = join(root, rel.replace(/^\//, ""))

      if (!filePath.startsWith(root) || !existsSync(filePath)) {
        res.writeHead(404)
        res.end("Not found")
        return
      }

      const body = readFileSync(filePath)
      res.writeHead(200, {
        "Content-Type": MIME[extname(filePath)] ?? "application/octet-stream",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Cache-Control": "no-store",
      })
      res.end(body)
    })

    this.port = await listenPrefer(this.server, this.preferredPort)
    console.log(`[static-host] Serving ${this.baseUrl}/ (youtube.html, spotify.html, …)`)
    return this.baseUrl
  }

  async stop(): Promise<void> {
    const server = this.server
    this.server = null
    this.port = null
    if (!server) return
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
  }
}

function listenPrefer(server: Server, preferredPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const tryListen = (port: number) => {
      const onError = (err: NodeJS.ErrnoException) => {
        server.off("listening", onListening)
        if (err.code === "EADDRINUSE" && port !== 0) {
          tryListen(0)
          return
        }
        reject(err)
      }
      const onListening = () => {
        server.off("error", onError)
        const addr = server.address()
        if (!addr || typeof addr === "string") {
          reject(new Error("StaticHost failed to bind"))
          return
        }
        resolve(addr.port)
      }
      server.once("error", onError)
      server.once("listening", onListening)
      server.listen(port, "127.0.0.1")
    }
    tryListen(preferredPort)
  })
}
