import { createHash } from "node:crypto"
import { AppContext } from "@repo/types"
import generateId from "../../lib/generateId"

/**
 * Image storage operations for chat images.
 * Images are stored as base64 strings in Redis, namespaced under rooms.
 * Key pattern: room:{roomId}:images:{imageId}
 * Index set: room:{roomId}:image-ids (tracks all image IDs for cleanup)
 * Content dedup: room:{roomId}:image-content:{sha256} -> imageId
 */

export function hashRoomImageContent(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex")
}

function imageKey(roomId: string, imageId: string) {
  return `room:${roomId}:images:${imageId}`
}

function imageIdsIndexKey(roomId: string) {
  return `room:${roomId}:image-ids`
}

function imageContentKey(roomId: string, contentHash: string) {
  return `room:${roomId}:image-content:${contentHash}`
}

type StoreImageParams = {
  roomId: string
  imageId: string
  base64Data: string
  mimeType: string
  contentHash?: string
  context: AppContext
}

/**
 * Store an image in Redis.
 * Also adds the imageId to a set for tracking (enables bulk deletion).
 */
export async function storeImage({
  roomId,
  imageId,
  base64Data,
  mimeType,
  contentHash,
  context,
}: StoreImageParams) {
  try {
    const key = imageKey(roomId, imageId)
    const indexKey = imageIdsIndexKey(roomId)

    const fields: Record<string, string> = {
      data: base64Data,
      mimeType,
    }
    if (contentHash) {
      fields.contentHash = contentHash
    }

    await context.redis.pubClient.hSet(key, fields)
    await context.redis.pubClient.sAdd(indexKey, imageId)

    return { success: true as const, imageId }
  } catch (e) {
    console.error("ERROR FROM data/images/storeImage", roomId, imageId, e)
    return { success: false as const, error: e }
  }
}

type StoreDedupedRoomImageParams = {
  roomId: string
  buffer: Buffer
  mimeType: string
  context: AppContext
}

/**
 * Store processed image bytes, reusing an existing room image when content matches.
 */
export async function storeDedupedRoomImage({
  roomId,
  buffer,
  mimeType,
  context,
}: StoreDedupedRoomImageParams) {
  const contentHash = hashRoomImageContent(buffer)
  const dedupKey = imageContentKey(roomId, contentHash)

  try {
    const existingId = await context.redis.pubClient.get(dedupKey)
    if (existingId) {
      const existing = await getImage({ roomId, imageId: existingId, context })
      if (existing) {
        return { success: true as const, imageId: existingId, cached: true as const }
      }
      await context.redis.pubClient.unlink(dedupKey)
    }

    const imageId = generateId()
    const stored = await storeImage({
      roomId,
      imageId,
      base64Data: buffer.toString("base64"),
      mimeType,
      contentHash,
      context,
    })

    if (!stored.success) {
      return stored
    }

    await context.redis.pubClient.set(dedupKey, imageId)
    return { success: true as const, imageId, cached: false as const }
  } catch (e) {
    console.error("ERROR FROM data/images/storeDedupedRoomImage", roomId, e)
    return { success: false as const, error: e }
  }
}

type GetImageParams = {
  roomId: string
  imageId: string
  context: AppContext
}

type ImageData = {
  data: string
  mimeType: string
} | null

/**
 * Retrieve an image from Redis.
 * Returns the base64 data and mimeType, or null if not found.
 */
export async function getImage({ roomId, imageId, context }: GetImageParams): Promise<ImageData> {
  try {
    const key = imageKey(roomId, imageId)
    const result = await context.redis.pubClient.hGetAll(key)

    if (!result || !result.data) {
      return null
    }

    return {
      data: result.data,
      mimeType: result.mimeType || "image/jpeg",
    }
  } catch (e) {
    console.error("ERROR FROM data/images/getImage", roomId, imageId, e)
    return null
  }
}

type DeleteRoomImagesParams = {
  roomId: string
  context: AppContext
}

/**
 * Delete all images for a room.
 * Uses the image-ids set to find and delete all image keys.
 */
export async function deleteRoomImages({ roomId, context }: DeleteRoomImagesParams) {
  try {
    const indexKey = imageIdsIndexKey(roomId)

    const imageIds = await context.redis.pubClient.sMembers(indexKey)

    if (imageIds.length === 0) {
      return { success: true, deleted: 0 }
    }

    const contentHashKeys: string[] = []
    for (const id of imageIds) {
      const hash = await context.redis.pubClient.hGet(imageKey(roomId, id), "contentHash")
      if (hash) {
        contentHashKeys.push(imageContentKey(roomId, hash))
      }
    }

    const imageKeys = imageIds.map((id) => imageKey(roomId, id))
    await context.redis.pubClient.unlink([...imageKeys, ...contentHashKeys])

    await context.redis.pubClient.unlink(indexKey)

    return { success: true, deleted: imageIds.length }
  } catch (e) {
    console.error("ERROR FROM data/images/deleteRoomImages", roomId, e)
    return { success: false, error: e }
  }
}
