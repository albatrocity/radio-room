import fs from "node:fs/promises"
import path from "node:path"
import type { Plugin } from "vite"

const ROUTE = "/__studio/trip-maps"
const MAP_ID = /^[a-z0-9][a-z0-9-]*$/
const MAX_BYTES = 800 * 1024

/**
 * Dev-only middleware for the Trip Map editor: list, read, and write
 * `<mapsDir>/<id>.json`. Ids follow the map schema's slug rule, so no path
 * traversal is possible.
 */
export function tripMapFilesPlugin(mapsDir: string): Plugin {
  return {
    name: "game-studio-trip-map-files",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(ROUTE, (req, res) => {
        void (async () => {
          const id = decodeURIComponent((req.url ?? "/").replace(/^\/+/, "").split("?")[0] ?? "")
          try {
            if (!id && req.method === "GET") {
              const entries = await fs.readdir(mapsDir).catch(() => [] as string[])
              const ids = entries
                .filter((f) => f.endsWith(".json"))
                .map((f) => f.slice(0, -5))
                .sort()
              res.setHeader("Content-Type", "application/json")
              res.end(JSON.stringify({ ids }))
              return
            }
            if (!MAP_ID.test(id)) {
              res.statusCode = 400
              res.end("Map ids are lowercase letters, digits, and dashes.")
              return
            }
            const file = path.join(mapsDir, `${id}.json`)
            if (req.method === "GET") {
              res.setHeader("Content-Type", "application/json")
              res.end(await fs.readFile(file, "utf8"))
              return
            }
            if (req.method === "PUT") {
              const chunks: Buffer[] = []
              let size = 0
              for await (const chunk of req) {
                size += (chunk as Buffer).length
                if (size > MAX_BYTES) {
                  res.statusCode = 413
                  res.end("Trip maps are limited to 800 KB.")
                  return
                }
                chunks.push(chunk as Buffer)
              }
              const body = Buffer.concat(chunks).toString("utf8")
              try {
                JSON.parse(body)
              } catch {
                res.statusCode = 400
                res.end("Not valid JSON.")
                return
              }
              await fs.mkdir(mapsDir, { recursive: true })
              await fs.writeFile(file, body)
              res.statusCode = 204
              res.end()
              return
            }
            res.statusCode = 405
            res.end()
          } catch (error) {
            res.statusCode = (error as NodeJS.ErrnoException).code === "ENOENT" ? 404 : 500
            res.end(String(error))
          }
        })()
      })
    },
  }
}
