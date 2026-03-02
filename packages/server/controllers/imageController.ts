import { Request, Response } from "express"
import multer from "multer"
import { AppContext } from "@repo/types"
import { storeImage, findRoom } from "../operations/data"
import generateId from "../lib/generateId"
import { isHeicMimeType, convertHeicToJpeg } from "../operations/data/imageConversion"

const MAX_FILE_SIZE = 4 * 1024 * 1024 // 4MB per image
const MAX_FILES = 5

const storage = multer.memoryStorage()

export const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true)
    } else {
      cb(new Error("Only image files are allowed"))
    }
  },
})

export async function uploadImages(req: Request, res: Response) {
  const { roomId } = req.params
  const context = (req as any).context as AppContext
  const files = req.files as Express.Multer.File[]

  if (!files || files.length === 0) {
    return res.status(400).json({ error: "No files provided" })
  }

  // Verify room exists
  const room = await findRoom({ context, roomId })
  if (!room) {
    return res.status(404).json({ error: "Room not found" })
  }

  // Check if chat images are allowed
  if (!room.allowChatImages) {
    return res.status(403).json({ error: "Image uploads are not allowed in this room" })
  }

  const uploadedImages: { id: string; url: string }[] = []
  const apiUrl = context.apiUrl || ""

  for (const file of files) {
    const imageId = generateId()
    let base64Data = file.buffer.toString("base64")
    let mimeType = file.mimetype

    // Convert HEIC to JPEG for browser compatibility
    if (isHeicMimeType(mimeType) || file.originalname.toLowerCase().endsWith(".heic")) {
      console.log(`[ImageController] Converting HEIC image to JPEG, size: ${base64Data.length} bytes`)
      try {
        base64Data = await convertHeicToJpeg(base64Data)
        mimeType = "image/jpeg"
        console.log(`[ImageController] HEIC conversion successful, new size: ${base64Data.length} bytes`)
      } catch (error) {
        console.error("[ImageController] HEIC conversion failed:", error)
        return res.status(500).json({ error: "Failed to process HEIC image" })
      }
    }

    // Store image in Redis
    const result = await storeImage({
      roomId,
      imageId,
      base64Data,
      mimeType,
      context,
    })

    if (!result.success) {
      console.error("[ImageController] Failed to store image:", result.error)
      return res.status(500).json({ error: "Failed to store image" })
    }

    uploadedImages.push({
      id: imageId,
      url: `${apiUrl}/api/rooms/${roomId}/images/${imageId}`,
    })
  }

  return res.json({
    success: true,
    images: uploadedImages,
  })
}
