import type { Request, Response } from "express"
import type { AppContext } from "@repo/types"
import { findRoom } from "../operations/data/rooms"
import {
  presignMusicUpload,
  completeMusicUpload,
  failMusicUpload,
  MusicUploadBadRequestError,
  MusicUploadForbiddenError,
  MusicUploadNotFoundError,
} from "../operations/musicUpload/musicUpload"
import { resolveRoomMemberUserId } from "../lib/resolveRoomMemberUserId"

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
