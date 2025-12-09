import { AppContext } from "@repo/types"

/**
 * Image storage operations for chat images.
 * Images are stored as base64 strings in Redis, namespaced under rooms.
 * Key pattern: room:{roomId}:images:{imageId}
 * Index set: room:{roomId}:image-ids (tracks all image IDs for cleanup)
 */

type StoreImageParams = {
  roomId: string
  imageId: string
  base64Data: string
  mimeType: string
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
  context,
}: StoreImageParams) {
  try {
    const imageKey = `room:${roomId}:images:${imageId}`
    const indexKey = `room:${roomId}:image-ids`

    // Store image data as a hash with base64 and mimeType
    await context.redis.pubClient.hSet(imageKey, {
      data: base64Data,
      mimeType,
    })

    // Track this image ID in the room's image set
    await context.redis.pubClient.sAdd(indexKey, imageId)

    return { success: true, imageId }
  } catch (e) {
    console.error("ERROR FROM data/images/storeImage", roomId, imageId, e)
    return { success: false, error: e }
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
    const imageKey = `room:${roomId}:images:${imageId}`
    const result = await context.redis.pubClient.hGetAll(imageKey)

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
    const indexKey = `room:${roomId}:image-ids`

    // Get all image IDs for this room
    const imageIds = await context.redis.pubClient.sMembers(indexKey)

    if (imageIds.length === 0) {
      return { success: true, deleted: 0 }
    }

    // Delete all image keys
    const imageKeys = imageIds.map((id) => `room:${roomId}:images:${id}`)
    await context.redis.pubClient.unlink(imageKeys)

    // Delete the index set
    await context.redis.pubClient.unlink(indexKey)

    return { success: true, deleted: imageIds.length }
  } catch (e) {
    console.error("ERROR FROM data/images/deleteRoomImages", roomId, e)
    return { success: false, error: e }
  }
}
