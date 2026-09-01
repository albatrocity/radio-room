import type { Request, Response } from "express"
import type { AppContext } from "@repo/types"
import { trackStatsIdentityQuerySchema } from "@repo/types"
import { resolveRoomMemberUserId } from "../lib/resolveRoomMemberUserId"
import {
  getTrackStats,
  TrackStatsBadRequestError,
} from "../operations/trackStats/getTrackStats"

function parseIdentityQuery(req: Request) {
  const raw = {
    mediaSourceType: req.query.mediaSourceType,
    mediaSourceTrackId: req.query.mediaSourceTrackId,
    spotifyTrackId: req.query.spotifyTrackId,
    tidalTrackId: req.query.tidalTrackId,
  }
  const parsed = trackStatsIdentityQuerySchema.safeParse(raw)
  if (!parsed.success) {
    throw new TrackStatsBadRequestError("Invalid track identity query parameters")
  }
  return parsed.data
}

export async function getTrackStatsHandler(req: Request, res: Response) {
  const { roomId } = req.params
  const context = (req as Request & { context?: AppContext }).context
  if (!context) {
    return res.status(500).json({ error: "Server context unavailable" })
  }

  const userId = await resolveRoomMemberUserId(req, context, roomId)
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" })
  }

  const roomExists = await context.redis.pubClient.exists(`room:${roomId}:details`)
  if (!roomExists) {
    return res.status(404).json({ error: "Room not found" })
  }

  try {
    const identity = parseIdentityQuery(req)
    const stats = await getTrackStats(context, identity)
    res.json({ stats })
  } catch (error) {
    if (error instanceof TrackStatsBadRequestError) {
      return res.status(400).json({ error: error.message })
    }
    console.error("[track-stats]", error)
    return res.status(500).json({ error: "Failed to load track stats" })
  }
}
