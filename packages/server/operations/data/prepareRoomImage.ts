import convert from "heic-convert"
import sharp from "sharp"
import {
  CHAT_IMAGE_JPEG_QUALITY,
  CHAT_IMAGE_MAX_DIMENSION,
  CHAT_IMAGE_UNPROCESSED_MAX_BYTES,
} from "@repo/types"

export type PreparedRoomImage = {
  buffer: Buffer
  mimeType: string
}

export class PrepareRoomImageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PrepareRoomImageError"
  }
}

export function isHeicMimeType(mimeType: string): boolean {
  return mimeType === "image/heic" || mimeType === "image/heif"
}

function isHeicFilename(filename: string): boolean {
  const lower = filename.toLowerCase()
  return lower.endsWith(".heic") || lower.endsWith(".heif")
}

function isGifOrSvg(mimeType: string, filename: string): boolean {
  const lower = filename.toLowerCase()
  return (
    mimeType === "image/gif" ||
    mimeType === "image/svg+xml" ||
    lower.endsWith(".gif") ||
    lower.endsWith(".svg")
  )
}

async function convertHeicBufferToJpeg(inputBuffer: Buffer): Promise<Buffer> {
  const outputBuffer = await convert({
    buffer: inputBuffer,
    format: "JPEG",
    quality: 0.9,
  })
  return Buffer.from(outputBuffer)
}

async function compressRasterToJpeg(inputBuffer: Buffer): Promise<Buffer> {
  return sharp(inputBuffer)
    .rotate()
    .resize({
      width: CHAT_IMAGE_MAX_DIMENSION,
      height: CHAT_IMAGE_MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: CHAT_IMAGE_JPEG_QUALITY, mozjpeg: true })
    .toBuffer()
}

/**
 * Resize, JPEG-compress, and strip EXIF from chat/artwork uploads before Redis storage.
 * GIF/SVG pass through unchanged when under CHAT_IMAGE_UNPROCESSED_MAX_BYTES.
 */
export async function prepareRoomImage(
  inputBuffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<PreparedRoomImage> {
  if (inputBuffer.length === 0) {
    throw new PrepareRoomImageError("Empty image file")
  }

  const normalizedMime = mimeType.trim().toLowerCase() || "application/octet-stream"
  const heic =
    isHeicMimeType(normalizedMime) ||
    (normalizedMime === "application/octet-stream" && isHeicFilename(filename))

  if (isGifOrSvg(normalizedMime, filename) && !heic) {
    if (inputBuffer.length > CHAT_IMAGE_UNPROCESSED_MAX_BYTES) {
      throw new PrepareRoomImageError(
        `GIF and SVG images must be under ${CHAT_IMAGE_UNPROCESSED_MAX_BYTES / (1024 * 1024)}MB`,
      )
    }
    const passMime =
      normalizedMime === "application/octet-stream"
        ? filename.toLowerCase().endsWith(".svg")
          ? "image/svg+xml"
          : "image/gif"
        : normalizedMime
    return { buffer: inputBuffer, mimeType: passMime }
  }

  let rasterBuffer = inputBuffer
  if (heic) {
    try {
      rasterBuffer = await convertHeicBufferToJpeg(inputBuffer)
    } catch {
      throw new PrepareRoomImageError("Failed to process HEIC image")
    }
  }

  try {
    const jpegBuffer = await compressRasterToJpeg(rasterBuffer)
    return { buffer: jpegBuffer, mimeType: "image/jpeg" }
  } catch {
    throw new PrepareRoomImageError("Failed to process image")
  }
}

/** @deprecated Use prepareRoomImage; kept for any legacy imports. */
export async function convertHeicToJpeg(base64Data: string): Promise<string> {
  const inputBuffer = Buffer.from(base64Data, "base64")
  const outputBuffer = await convertHeicBufferToJpeg(inputBuffer)
  return outputBuffer.toString("base64")
}
