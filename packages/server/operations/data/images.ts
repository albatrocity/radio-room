import { createHash } from "node:crypto"
import { AppContext } from "@repo/types"
import generateId from "../../lib/generateId"
import {
  assertRedisValueSize,
  REDIS_POINTER_MAX_BYTES,
  RedisValueTooLargeError,
} from "../../lib/assertRedisValueSize"

/**
 * Room image storage (ADR 0186): bytes live in S3 under media/rooms/;
 * Redis holds URL pointers (and legacy base64 during cutover).
 * Key pattern: room:{roomId}:images:{imageId}
 * Index set: room:{roomId}:image-ids
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
  base64Data?: string
  url?: string
  mimeType: string
  contentHash?: string
  context: AppContext
}

/**
 * Store an image record in Redis (URL pointer preferred; base64 legacy only).
 */
export async function storeImage({
  roomId,
  imageId,
  base64Data,
  url,
  mimeType,
  contentHash,
  context,
}: StoreImageParams) {
  try {
    const key = imageKey(roomId, imageId)
    const indexKey = imageIdsIndexKey(roomId)

    const fields: Record<string, string> = {
      mimeType,
    }
    if (url) {
      assertRedisValueSize(`storeImage:${imageId}:url`, url, REDIS_POINTER_MAX_BYTES)
      fields.url = url
    } else if (base64Data) {
      assertRedisValueSize(`storeImage:${imageId}`, base64Data)
      fields.data = base64Data
    } else {
      throw new Error("storeImage requires url or base64Data")
    }
    if (contentHash) {
      fields.contentHash = contentHash
    }

    await context.redis.pubClient.hSet(key, fields)
    await context.redis.pubClient.sAdd(indexKey, imageId)

    return { success: true as const, imageId }
  } catch (e) {
    if (e instanceof RedisValueTooLargeError) {
      console.error("ERROR FROM data/images/storeImage", roomId, imageId, e.message)
      return { success: false as const, error: e }
    }
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
 * Store processed image bytes in S3; Redis keeps URL + content-hash dedup.
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
      if (existing && (existing.url || existing.data)) {
        return {
          success: true as const,
          imageId: existingId,
          cached: true as const,
          url: existing.url,
        }
      }
      await context.redis.pubClient.unlink(dedupKey)
    }

    const { ensureRoomImageObject } = await import("../../services/MediaObjectCache")
    const uploaded = await ensureRoomImageObject({
      context,
      roomId,
      buffer,
      mimeType,
    })

    const imageId = generateId()
    const stored = await storeImage({
      roomId,
      imageId,
      url: uploaded.url,
      mimeType,
      contentHash,
      context,
    })

    if (!stored.success) {
      return stored
    }

    await context.redis.pubClient.set(dedupKey, imageId)
    return {
      success: true as const,
      imageId,
      cached: false as const,
      url: uploaded.url,
    }
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
  data?: string
  url?: string
  mimeType: string
} | null

/**
 * Retrieve an image record from Redis (CDN URL or legacy base64).
 */
export async function getImage({ roomId, imageId, context }: GetImageParams): Promise<ImageData> {
  try {
    const key = imageKey(roomId, imageId)
    const result = await context.redis.pubClient.hGetAll(key)

    if (!result || (!result.data && !result.url)) {
      return null
    }

    return {
      ...(result.url ? { url: result.url } : {}),
      ...(result.data ? { data: result.data } : {}),
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
 * Delete all image Redis records for a room (S3 objects rely on lifecycle).
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
