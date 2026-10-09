import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { readFileSync } from "node:fs"
import {
  applyCorsHeaders,
  buildIcyMetadataBlock,
  wantsIcyMetadata,
  type TrackMeta,
} from "./icy.js"
import type { NowPlayingController } from "./nowPlaying.js"

export type StreamServerOptions = {
  host: string
  port: number
  mp3Path: string
  metaint: number
  bitrateKbps: number
  nowPlaying: NowPlayingController
}

type StreamClient = {
  res: ServerResponse
  icy: boolean
  audioOffset: number
  bytesSinceMeta: number
  closed: boolean
}

export type StreamServer = {
  server: Server
  url: string
  streamUrl: string
  close: () => Promise<void>
  listenerCount: () => number
}

export function createStreamServer(options: StreamServerOptions): StreamServer {
  const audio = readFileSync(options.mp3Path)
  if (audio.length === 0) {
    throw new Error(`MP3 fixture is empty: ${options.mp3Path}`)
  }

  const clients = new Set<StreamClient>()
  const bytesPerSecond = Math.max(1, Math.floor((options.bitrateKbps * 1000) / 8))
  const chunkBytes = Math.min(options.metaint, 4096)

  const server = createServer((req, res) => {
    handleRequest(req, res)
  })

  let pumpTimer: ReturnType<typeof setInterval> | null = null

  function startPump(): void {
    if (pumpTimer) return
    // Pump ~4 chunks/sec of wall time relative to bitrate for smooth playback.
    const intervalMs = Math.max(20, Math.floor((chunkBytes / bytesPerSecond) * 1000))
    pumpTimer = setInterval(() => {
      for (const client of Array.from(clients)) {
        if (client.closed) {
          clients.delete(client)
          continue
        }
        writeAudioChunk(client)
      }
      if (clients.size === 0 && pumpTimer) {
        clearInterval(pumpTimer)
        pumpTimer = null
      }
    }, intervalMs)
  }

  function writeAudioChunk(client: StreamClient): void {
    if (client.closed || client.res.writableEnded || client.res.destroyed) {
      client.closed = true
      return
    }

    let remaining = chunkBytes
    while (remaining > 0 && !client.closed) {
      const untilMeta = client.icy ? options.metaint - client.bytesSinceMeta : remaining
      const take = Math.min(remaining, untilMeta, audio.length - client.audioOffset)
      if (take <= 0) {
        client.audioOffset = 0
        continue
      }
      const slice = audio.subarray(client.audioOffset, client.audioOffset + take)
      client.audioOffset = (client.audioOffset + take) % audio.length
      client.bytesSinceMeta += take
      remaining -= take

      try {
        client.res.write(slice)
      } catch {
        client.closed = true
        return
      }

      if (client.icy && client.bytesSinceMeta >= options.metaint) {
        const title = options.nowPlaying.getSnapshot().streamTitle
        try {
          client.res.write(buildIcyMetadataBlock(title))
        } catch {
          client.closed = true
          return
        }
        client.bytesSinceMeta = 0
      }
    }
  }

  function handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)

    if (req.method === "OPTIONS") {
      res.writeHead(204, applyCorsHeaders({}))
      res.end()
      return
    }

    if (url.pathname === "/health") {
      const snap = options.nowPlaying.getSnapshot()
      const body = JSON.stringify({
        ok: true,
        listeners: clients.size,
        nowPlaying: snap,
      })
      res.writeHead(
        200,
        applyCorsHeaders({
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        }),
      )
      res.end(body)
      return
    }

    if (url.pathname === "/now-playing" && req.method === "POST") {
      void readJsonBody(req)
        .then((body) => {
          const meta: TrackMeta = {
            title: String(body.title ?? ""),
            artist: String(body.artist ?? ""),
            album: String(body.album ?? ""),
          }
          if (!meta.title.trim()) {
            res.writeHead(400, applyCorsHeaders({ "Content-Type": "application/json" }))
            res.end(JSON.stringify({ ok: false, error: "title required" }))
            return
          }
          options.nowPlaying.setTrack(meta, "manual")
          res.writeHead(200, applyCorsHeaders({ "Content-Type": "application/json" }))
          res.end(JSON.stringify({ ok: true, nowPlaying: options.nowPlaying.getSnapshot() }))
        })
        .catch((err: unknown) => {
          res.writeHead(400, applyCorsHeaders({ "Content-Type": "application/json" }))
          res.end(JSON.stringify({ ok: false, error: String(err) }))
        })
      return
    }

    if (url.pathname === "/stream" || url.pathname === "/") {
      const icy = wantsIcyMetadata(
        typeof req.headers["icy-metadata"] === "string"
          ? req.headers["icy-metadata"]
          : undefined,
      )
      const headers = applyCorsHeaders({
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-cache, no-store",
        Connection: "close",
        "icy-name": "Listening Room Dev Radio",
        "icy-br": String(options.bitrateKbps),
        ...(icy ? { "icy-metaint": String(options.metaint) } : {}),
      })
      res.writeHead(200, headers)

      // Send a short burst so metadata pollers see StreamTitle quickly.
      const client: StreamClient = {
        res,
        icy,
        audioOffset: 0,
        bytesSinceMeta: 0,
        closed: false,
      }
      clients.add(client)
      const burstChunks = icy ? Math.ceil(options.metaint / chunkBytes) + 1 : 2
      for (let i = 0; i < burstChunks && !client.closed; i++) {
        writeAudioChunk(client)
      }
      startPump()

      const cleanup = () => {
        client.closed = true
        clients.delete(client)
      }
      req.on("close", cleanup)
      res.on("close", cleanup)
      return
    }

    res.writeHead(404, applyCorsHeaders({ "Content-Type": "text/plain" }))
    res.end("not found")
  }

  return {
    server,
    get url() {
      const addr = server.address()
      if (addr && typeof addr === "object") {
        const host = addr.address === "::" || addr.address === "0.0.0.0" ? "127.0.0.1" : addr.address
        return `http://${host}:${addr.port}`
      }
      return `http://127.0.0.1:${options.port}`
    },
    get streamUrl() {
      return `${this.url}/stream`
    },
    listenerCount: () => clients.size,
    close: async () => {
      if (pumpTimer) {
        clearInterval(pumpTimer)
        pumpTimer = null
      }
      for (const client of Array.from(clients)) {
        client.closed = true
        try {
          client.res.end()
        } catch {
          // ignore
        }
      }
      clients.clear()
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()))
      })
    },
  }
}

export async function listen(server: StreamServer, host: string, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.server.once("error", reject)
    server.server.listen(port, host, () => resolve())
  })
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const raw = Buffer.concat(chunks).toString("utf8")
  if (!raw.trim()) return {}
  return JSON.parse(raw) as Record<string, unknown>
}
