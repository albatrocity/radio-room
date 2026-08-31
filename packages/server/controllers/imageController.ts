import { Request, Response, NextFunction } from "express"
import multer from "multer"
import { AppContext, CHAT_IMAGE_UPLOAD_MAX_BYTES } from "@repo/types"
import { storeImage, findRoom } from "../operations/data"
import { isRoomAdmin } from "../operations/data/admins"
import generateId from "../lib/generateId"
import {
  prepareRoomImage,
  PrepareRoomImageError,
} from "../operations/data/prepareRoomImage"
import { resolveRoomMemberUserId } from "../lib/resolveRoomMemberUserId"

const MAX_FILES = 5

const storage = multer.memoryStorage()

function isAllowedImageFile(file: Express.Multer.File): boolean {
  if (file.mimetype.startsWith("image/")) return true
  const lower = file.originalname.toLowerCase()
  return lower.endsWith(".heic") || lower.endsWith(".heif")
}

export const upload = multer({
  storage,
  limits: {
    fileSize: CHAT_IMAGE_UPLOAD_MAX_BYTES,
    files: MAX_FILES,
  },
  fileFilter: (req, file, cb) => {
    if (isAllowedImageFile(file)) {
      cb(null, true)
    } else {
      cb(new Error("Only image files are allowed"))
    }
  },
})

/** Maps multer LIMIT_FILE_SIZE to HTTP 413 for image upload routes. */
export function handleImageUploadMulterError(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      error: `Each image must be under ${CHAT_IMAGE_UPLOAD_MAX_BYTES / (1024 * 1024)}MB`,
    })
  }
  if (err instanceof Error && err.message === "Only image files are allowed") {
    return res.status(415).json({ error: err.message })
  }
  return next(err)
}

async function processAndStoreImage(params: {
  roomId: string
  file: Express.Multer.File
  context: AppContext
}): Promise<{ id: string; url: string } | { error: string; status: number }> {
  const { roomId, file, context } = params
  const imageId = generateId()

  let prepared
  try {
    prepared = await prepareRoomImage(file.buffer, file.mimetype, file.originalname)
  } catch (error) {
    if (error instanceof PrepareRoomImageError) {
      return { error: error.message, status: 400 }
    }
    console.error("[ImageController] Failed to prepare image:", error)
    return { error: "Failed to process image", status: 500 }
  }

  const base64Data = prepared.buffer.toString("base64")
  const result = await storeImage({
    roomId,
    imageId,
    base64Data,
    mimeType: prepared.mimeType,
    context,
  })

  if (!result.success) {
    console.error("[ImageController] Failed to store image:", result.error)
    return { error: "Failed to store image", status: 500 }
  }

  const apiUrl = context.apiUrl || ""
  return {
    id: imageId,
    url: `${apiUrl}/api/rooms/${roomId}/images/${imageId}`,
  }
}

/** Wraps multer so LIMIT_FILE_SIZE returns 413 before the route handler runs. */
export function chatImagesUploadMiddleware(req: Request, res: Response, next: NextFunction) {
  upload.array("images", MAX_FILES)(req, res, (err) => {
    if (err) return handleImageUploadMulterError(err, req, res, next)
    next()
  })
}

export function artworkUploadMiddleware(req: Request, res: Response, next: NextFunction) {
  upload.single("artwork")(req, res, (err) => {
    if (err) return handleImageUploadMulterError(err, req, res, next)
    next()
  })
}

export async function uploadImages(req: Request, res: Response) {
  const { roomId } = req.params
  const context = (req as any).context as AppContext
  const files = req.files as Express.Multer.File[]

  if (!files || files.length === 0) {
    return res.status(400).json({ error: "No files provided" })
  }

  const userId = await resolveRoomMemberUserId(req, context, roomId)
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" })
  }

  const room = await findRoom({ context, roomId })
  if (!room) {
    return res.status(404).json({ error: "Room not found" })
  }

  const canUpload =
    room.allowChatImages === true ||
    (await isRoomAdmin({
      roomId,
      userId,
      roomCreator: room.creator,
      context,
    }))
  if (!canUpload) {
    return res.status(403).json({ error: "Image uploads are not allowed in this room" })
  }

  const uploadedImages: { id: string; url: string }[] = []

  for (const file of files) {
    const outcome = await processAndStoreImage({ roomId, file, context })
    if ("error" in outcome) {
      return res.status(outcome.status).json({ error: outcome.error })
    }
    uploadedImages.push(outcome)
  }

  return res.json({
    success: true,
    images: uploadedImages,
  })
}

/**
 * Upload a single artwork image for a room. Requires room admin.
 * Stores the image in Redis and returns its serving URL.
 */
export async function uploadArtwork(req: Request, res: Response) {
  const { roomId } = req.params
  const context = (req as any).context as AppContext
  const file = req.file as Express.Multer.File | undefined

  if (!file) {
    return res.status(400).json({ error: "No file provided" })
  }

  const userId = req.session.user?.userId
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" })
  }

  const room = await findRoom({ context, roomId })
  if (!room) {
    return res.status(404).json({ error: "Room not found" })
  }

  const isAdmin = await isRoomAdmin({ roomId, userId, roomCreator: room.creator, context })
  if (!isAdmin) {
    return res.status(403).json({ error: "Only room admins can upload artwork" })
  }

  const outcome = await processAndStoreImage({ roomId, file, context })
  if ("error" in outcome) {
    return res.status(outcome.status).json({ error: outcome.error })
  }

  return res.json({
    success: true,
    url: outcome.url,
  })
}
