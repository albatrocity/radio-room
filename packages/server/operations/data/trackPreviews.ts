import type { AppContext } from "@repo/types"

const PREVIEW_TTL_SEC = 14400 // 4 hours

type StoredTrackPreview = {
  data: string
  mimeType: string
  previewId: string
}

function previewKey(roomId: string, trackId: string) {
  return `room:${roomId}:track-previews:${trackId}`
}

function previewIdIndexKey(roomId: string, previewId: string) {
  return `room:${roomId}:track-preview-id:${previewId}`
}

export async function getCachedTrackPreview(params: {
  context: AppContext
  roomId: string
  trackId: string
}): Promise<(StoredTrackPreview & { trackId: string }) | null> {
  const { context, roomId, trackId } = params
  const key = previewKey(roomId, trackId)
  try {
    const result = await context.redis.pubClient.hGetAll(key)
    if (!result?.data || !result.previewId) return null
    return {
      trackId,
      data: result.data,
      mimeType: result.mimeType || "audio/mpeg",
      previewId: result.previewId,
    }
  } catch (e) {
    console.error("ERROR FROM data/trackPreviews/getCachedTrackPreview", roomId, trackId, e)
    return null
  }
}

export async function storeTrackPreview(params: {
  context: AppContext
  roomId: string
  trackId: string
  previewId: string
  base64Data: string
  mimeType: string
}): Promise<{ success: boolean }> {
  const { context, roomId, trackId, previewId, base64Data, mimeType } = params
  const key = previewKey(roomId, trackId)
  const indexKey = previewIdIndexKey(roomId, previewId)
  try {
    await context.redis.pubClient.hSet(key, {
      data: base64Data,
      mimeType,
      previewId,
    })
    await context.redis.pubClient.set(indexKey, trackId, { EX: PREVIEW_TTL_SEC })
    await context.redis.pubClient.expire(key, PREVIEW_TTL_SEC)
    return { success: true }
  } catch (e) {
    console.error("ERROR FROM data/trackPreviews/storeTrackPreview", roomId, trackId, e)
    return { success: false }
  }
}

export async function getTrackPreviewByPreviewId(params: {
  context: AppContext
  roomId: string
  previewId: string
}): Promise<(StoredTrackPreview & { trackId: string }) | null> {
  const { context, roomId, previewId } = params
  try {
    const trackId = await context.redis.pubClient.get(previewIdIndexKey(roomId, previewId))
    if (!trackId) return null
    const cached = await getCachedTrackPreview({ context, roomId, trackId })
    if (!cached || cached.previewId !== previewId) return null
    return cached
  } catch (e) {
    console.error("ERROR FROM data/trackPreviews/getTrackPreviewByPreviewId", roomId, previewId, e)
    return null
  }
}

export type TrackPreviewGenerationResult =
  | { ok: true; previewId: string; durationMs: number }
  | { ok: false; message: string }

/** Coalesce in-flight preview generation per room+track. */
const inFlightGeneration = new Map<string, Promise<TrackPreviewGenerationResult>>()

export function getInFlightPreviewKey(roomId: string, trackId: string) {
  return `${roomId}:${trackId}`
}

export function getInFlightPreviewGeneration(key: string) {
  return inFlightGeneration.get(key)
}

export function setInFlightPreviewGeneration(
  key: string,
  promise: Promise<TrackPreviewGenerationResult>,
) {
  inFlightGeneration.set(key, promise)
  // `.finally()` re-rejects if `promise` rejects. Swallow that so Node 15+
  // `--unhandled-rejections=throw` cannot take down the API when a clip fails
  // (missing ffmpeg, daemon error, etc.). Callers still handle the original.
  void promise
    .finally(() => {
      if (inFlightGeneration.get(key) === promise) {
        inFlightGeneration.delete(key)
      }
    })
    .catch(() => {})
}

export { PREVIEW_TTL_SEC }
