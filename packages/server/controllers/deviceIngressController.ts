import type { Request, Response } from "express"
import type { AppContext, Room } from "@repo/types"
import { createJobApi } from "../lib/createJobApi"
import { readDeviceSession } from "../lib/deviceSessionStore"
import { readDeviceSegment } from "../operations/activeSegmentForDevice"
import { getAllRooms, parseRoom } from "../operations/data"
import { submitNowPlaying } from "../operations/room/submitNowPlaying"

type DeviceAuth =
  | { ok: true; via: "secret" }
  | { ok: true; via: "token"; roomId: string | null }
  | { ok: false }

/**
 * Bearer is DEVICE_INGRESS_SECRET (same comparison as stream health) or a
 * device-session token minted after link. The link code itself is never a bearer.
 */
async function authorizeDevice(req: Request, res: Response): Promise<DeviceAuth> {
  const secret = process.env.DEVICE_INGRESS_SECRET
  if (!secret) {
    console.warn("[device] DEVICE_INGRESS_SECRET not configured")
    res.status(503).json({ error: "device ingress not configured" })
    return { ok: false }
  }

  const auth = req.headers.authorization
  if (!auth || !auth.startsWith("Bearer ")) {
    res.status(401).json({ error: "unauthorized" })
    return { ok: false }
  }

  if (auth === `Bearer ${secret}`) {
    return { ok: true, via: "secret" }
  }

  const token = auth.slice("Bearer ".length)
  const context = (req as Request & { context?: AppContext }).context
  if (!context) {
    res.status(401).json({ error: "unauthorized" })
    return { ok: false }
  }
  const session = await readDeviceSession(context.redis.pubClient, token)
  if (!session) {
    res.status(401).json({ error: "unauthorized" })
    return { ok: false }
  }
  return { ok: true, via: "token", roomId: session.roomId }
}

function contextOf(req: Request): AppContext {
  return (req as Request & { context: AppContext }).context
}

/**
 * POST /api/device/now-playing
 *
 * Body: { roomId, title, artist?, album? } — the shape RtmpRoomSubscriber parses.
 * Empty title clears now playing (submitMediaData with no submission).
 */
export async function deviceNowPlaying(req: Request, res: Response) {
  const auth = await authorizeDevice(req, res)
  if (!auth.ok) return

  const body = req.body ?? {}
  const roomId = typeof body.roomId === "string" ? body.roomId.trim() : ""
  if (!roomId) {
    return res.status(400).json({ error: 'body must include "roomId"' })
  }
  if (auth.via === "token" && auth.roomId && auth.roomId !== roomId) {
    return res.status(403).json({ error: "token is not valid for this room" })
  }

  const context = contextOf(req)
  const api = createJobApi(context)
  await submitNowPlaying(api, roomId, {
    title: typeof body.title === "string" ? body.title : "",
    artist: typeof body.artist === "string" ? body.artist : undefined,
    album: typeof body.album === "string" ? body.album : undefined,
  })
  return res.status(200).json({ ok: true })
}

/**
 * GET /api/device/active-segment?roomId=
 *
 * SegmentActivated JSON, or 204 when the room has no active segment.
 */
export async function deviceActiveSegment(req: Request, res: Response) {
  const auth = await authorizeDevice(req, res)
  if (!auth.ok) return

  const roomId = typeof req.query.roomId === "string" ? req.query.roomId.trim() : ""
  if (!roomId) {
    return res.status(400).json({ error: 'query must include "roomId"' })
  }
  if (auth.via === "token" && auth.roomId && auth.roomId !== roomId) {
    return res.status(403).json({ error: "token is not valid for this room" })
  }

  const context = contextOf(req)
  const read = await readDeviceSegment(context, roomId)
  if (read.status === "missing") {
    return res.status(404).json({ error: "room not found" })
  }
  if (read.status === "inactive") {
    return res.status(204).end()
  }
  return res.status(200).json(read.payload)
}

export type DeviceRoomListItem = {
  id: string
  title: string
  type: string
  playbackControllerId: string
  playbackMode: string
  public: boolean
  bridgeReady: boolean
}

/**
 * GET /api/device/rooms
 *
 * Replaces the daemon reading the Redis `rooms` set.
 */
export async function deviceRooms(req: Request, res: Response) {
  const auth = await authorizeDevice(req, res)
  if (!auth.ok) return

  const context = contextOf(req)
  const stored = await getAllRooms({ context })
  const rooms = stored
    .map(parseRoom)
    .map(toDeviceRoom)
    .sort((a, b) => {
      if (a.bridgeReady !== b.bridgeReady) return a.bridgeReady ? -1 : 1
      return a.title.localeCompare(b.title)
    })
  return res.status(200).json({ ok: true, rooms })
}

function toDeviceRoom(room: Room): DeviceRoomListItem {
  const playbackControllerId = room.playbackControllerId ?? ""
  return {
    id: room.id,
    title: room.title || room.id,
    type: room.type || "unknown",
    playbackControllerId,
    playbackMode: room.playbackMode || "",
    public: room.public !== false,
    bridgeReady: playbackControllerId === "bridge",
  }
}
