import type { Request, Response } from "express"
import type { AppContext } from "@repo/types"
import { RADIO_SESSION_HEADER } from "../lib/constants"
import { getUser, getRoomUsers } from "../operations/data"
import { findRoom } from "../operations/data/rooms"
import {
  presignMusicUpload,
  completeMusicUpload,
  failMusicUpload,
  MusicUploadBadRequestError,
  MusicUploadForbiddenError,
  MusicUploadNotFoundError,
} from "../operations/musicUpload/musicUpload"

async function resolveRoomMemberUserId(
  req: Request,
  context: AppContext,
  roomId: string,
): Promise<string | null> {
  const fromSession = req.session.user?.userId
  if (fromSession) {
    return fromSession
  }

  const fromHeader = req.get(RADIO_SESSION_HEADER)?.trim()
  if (!fromHeader) {
    return null
  }

  const user = await getUser({ context, userId: fromHeader })
  if (!user) {
    return null
  }

  const roomUsers = await getRoomUsers({ context, roomId })
  if (!roomUsers.some((u) => u.userId === fromHeader)) {
    return null
  }

  return fromHeader
}

function handleMusicUploadError(res: Response, error: unknown) {
  if (error instanceof MusicUploadNotFoundError) {
    res.status(404).json({ error: error.message })
    return
  }
  if (error instanceof MusicUploadForbiddenError) {
    res.status(403).json({ error: error.message })
    return
  }
  if (error instanceof MusicUploadBadRequestError) {
    res.status(400).json({ error: error.message })
    return
  }
  console.error("[music-upload]", error)
  res.status(500).json({ error: "Music upload request failed" })
}

export async function presignMusicUploadHandler(req: Request, res: Response) {
  const { roomId } = req.params
  const context = (req as Request & { context?: AppContext }).context
  if (!context) {
    return res.status(500).json({ error: "Server context unavailable" })
  }

  const userId = await resolveRoomMemberUserId(req, context, roomId)
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" })
  }

  const room = await findRoom({ context, roomId })
  if (!room) {
    return res.status(404).json({ error: "Room not found" })
  }

  try {
    const result = await presignMusicUpload({
      context,
      roomId,
      userId,
      body: req.body ?? {},
    })
    res.json(result)
  } catch (error) {
    handleMusicUploadError(res, error)
  }
}

export async function completeMusicUploadHandler(req: Request, res: Response) {
  const { roomId } = req.params
  const context = (req as Request & { context?: AppContext }).context
  if (!context) {
    return res.status(500).json({ error: "Server context unavailable" })
  }

  const userId = await resolveRoomMemberUserId(req, context, roomId)
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" })
  }

  try {
    const result = await completeMusicUpload({
      context,
      roomId,
      userId,
      body: req.body ?? {},
    })
    res.json(result)
  } catch (error) {
    handleMusicUploadError(res, error)
  }
}

export async function failMusicUploadHandler(req: Request, res: Response) {
  const { roomId } = req.params
  const context = (req as Request & { context?: AppContext }).context
  if (!context) {
    return res.status(500).json({ error: "Server context unavailable" })
  }

  const userId = await resolveRoomMemberUserId(req, context, roomId)
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" })
  }

  try {
    const result = await failMusicUpload({
      context,
      roomId,
      userId,
      body: req.body ?? {},
    })
    res.json(result)
  } catch (error) {
    handleMusicUploadError(res, error)
  }
}
