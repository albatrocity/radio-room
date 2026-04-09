import type { Request, Response } from "express"
import type { AppContext } from "@repo/types"
import { getAllRooms, parseRoom } from "../operations/data"
import handleStreamHealth from "../operations/room/handleStreamHealth"
import { isHybridRadioRoom } from "../lib/roomTypeHelpers"

/**
 * Extracts the stream path from a WHEP URL.
 * e.g. "https://stream.listeningroom.club/live/whep" → "live"
 */
function extractStreamPath(whepUrl: string): string | null {
  try {
    const url = new URL(whepUrl)
    const segments = url.pathname.split("/").filter(Boolean)
    return segments[0] ?? null
  } catch {
    return null
  }
}

/**
 * POST /api/stream-health
 *
 * Called by MediaMTX runOnReady/runOnNotReady hooks via curl.
 * Authenticated with a shared Bearer token (STREAM_HEALTH_SECRET).
 *
 * Body: { "path": "live", "status": "online" | "offline" }
 */
export async function streamHealth(req: Request, res: Response) {
  const secret = process.env.STREAM_HEALTH_SECRET
  if (!secret) {
    console.warn("[stream-health] STREAM_HEALTH_SECRET not configured")
    return res.status(503).json({ error: "stream health not configured" })
  }

  const auth = req.headers.authorization
  if (!auth || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "unauthorized" })
  }

  const { path, status } = req.body ?? {}
  if (!path || (status !== "online" && status !== "offline")) {
    return res.status(400).json({ error: 'body must include "path" and "status" (online|offline)' })
  }

  const context = (req as any).context as AppContext

  const rooms = await getAllRooms({ context })
  const matched = rooms.map(parseRoom).filter((room) => {
    if (room.type === "live") {
      const roomPath = room.radioListenUrl ? extractStreamPath(room.radioListenUrl) : null
      return roomPath === path
    }
    if (isHybridRadioRoom(room) && room.liveWhepUrl) {
      const roomPath = extractStreamPath(room.liveWhepUrl)
      return roomPath === path
    }
    return false
  })

  if (matched.length === 0) {
    return res
      .status(404)
      .json({ error: `no room found for stream path "${path}" (live or hybrid radio with WebRTC)` })
  }

  await Promise.all(
    matched.map((room) => handleStreamHealth({ context, roomId: room.id, status })),
  )

  console.log(`[stream-health] path="${path}" status="${status}" rooms=${matched.map((r) => r.id).join(",")}`)
  return res.status(200).json({ ok: true, rooms: matched.length })
}
