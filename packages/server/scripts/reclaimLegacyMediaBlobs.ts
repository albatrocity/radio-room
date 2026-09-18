#!/usr/bin/env npx tsx
/**
 * Reclaim legacy Redis image/preview blobs after ADR 0186 cutover.
 *
 * Run OFF-SHOW. Uses SCAN + UNLINK (non-blocking) so the reclaim does not
 * stall the Redis event loop mid-show.
 *
 * Usage:
 *   REDIS_URL=redis://... npx tsx packages/server/scripts/reclaimLegacyMediaBlobs.ts [--dry-run] [--room roomId]
 *
 * Patterns unlinked (when the hash still has a `data` field):
 *   room:{id}:images:al-cover-*
 *   room:{id}:images:pl-cover-*
 *   room:{id}:images:qimg-*
 *   room:{id}:images:*          (legacy chat blobs with `data`)
 *   room:{id}:track-previews:*  (legacy base64 clips)
 *
 * Records used_memory before/after via INFO memory.
 */
import { createClient } from "redis"

const DRY_RUN = process.argv.includes("--dry-run")
const roomFlagIdx = process.argv.indexOf("--room")
const ROOM_FILTER = roomFlagIdx >= 0 ? process.argv[roomFlagIdx + 1] : null

const MATCHES = ROOM_FILTER
  ? [
      `room:${ROOM_FILTER}:images:*`,
      `room:${ROOM_FILTER}:track-previews:*`,
    ]
  : ["room:*:images:*", "room:*:track-previews:*"]

async function parseUsedMemory(client: ReturnType<typeof createClient>): Promise<number | null> {
  const info = await client.info("memory")
  const m = /used_memory:(\d+)/.exec(info)
  return m?.[1] ? Number(m[1]) : null
}

async function main() {
  const url = process.env.REDIS_URL || process.env.REDIS_TLS_URL
  if (!url) {
    console.error("Set REDIS_URL (or REDIS_TLS_URL)")
    process.exit(1)
  }

  const client = createClient({
    url,
    socket: url.startsWith("rediss://")
      ? { tls: true, rejectUnauthorized: false }
      : undefined,
  })
  client.on("error", (e) => console.error("Redis error", e))
  await client.connect()

  const before = await parseUsedMemory(client)
  console.log(
    `[reclaim] used_memory before: ${before != null ? `${Math.round(before / (1024 * 1024))}MB` : "unknown"}`,
  )
  console.log(`[reclaim] dryRun=${DRY_RUN} room=${ROOM_FILTER ?? "*"}`)

  let scanned = 0
  let unlinked = 0
  let skippedUrlOnly = 0

  for (const match of MATCHES) {
    let cursor = 0
    do {
      const result = await client.scan(cursor, { MATCH: match, COUNT: 200 })
      cursor = result.cursor
      for (const key of result.keys) {
        scanned++
        const type = await client.type(key)
        if (type !== "hash") continue
        const data = await client.hGet(key, "data")
        if (!data) {
          skippedUrlOnly++
          continue
        }
        // Prefer unlinking cover/qimg prefixes; for generic images only when data present
        const isLegacyCover =
          key.includes(":images:al-cover-") ||
          key.includes(":images:pl-cover-") ||
          key.includes(":images:qimg-") ||
          key.includes(":track-previews:") ||
          key.includes(":images:")
        if (!isLegacyCover) continue
        if (DRY_RUN) {
          console.log(`[dry-run] would UNLINK ${key} (${Buffer.byteLength(data, "utf8")} bytes)`)
          unlinked++
          continue
        }
        await client.unlink(key)
        unlinked++
        if (unlinked % 50 === 0) {
          console.log(`[reclaim] unlinked ${unlinked} keys so far...`)
        }
      }
    } while (cursor !== 0)
  }

  const after = await parseUsedMemory(client)
  console.log(`[reclaim] scanned=${scanned} unlinked=${unlinked} skippedUrlOnly=${skippedUrlOnly}`)
  console.log(
    `[reclaim] used_memory after: ${after != null ? `${Math.round(after / (1024 * 1024))}MB` : "unknown"}`,
  )
  if (before != null && after != null) {
    console.log(
      `[reclaim] delta: ${Math.round((before - after) / (1024 * 1024))}MB freed`,
    )
  }

  await client.quit()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
