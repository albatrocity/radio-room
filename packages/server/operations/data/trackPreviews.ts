import type { AppContext } from "@repo/types"
import { assertRedisValueSize, REDIS_POINTER_MAX_BYTES } from "../../lib/assertRedisValueSize"

/** Legacy room-scoped preview id → CDN URL (HTTP 302 cutover). */
const PREVIEW_ID_TTL_SEC = 7 * 24 * 60 * 60

function previewIdIndexKey(roomId: string, previewId: string) {
  return `room:${roomId}:track-preview-id:${previewId}`
}

export type PreviewIdRecord = {
  url: string
  mimeType: string
  trackId: string
}

export async function storePreviewIdRedirect(params: {
  context: AppContext
  roomId: string
  previewId: string
  trackId: string
  url: string
  mimeType: string
}): Promise<void> {
  const { context, roomId, previewId, trackId, url, mimeType } = params
  const payload = JSON.stringify({ url, mimeType, trackId } satisfies PreviewIdRecord)
  assertRedisValueSize(`previewIdRedirect:${previewId}`, payload, REDIS_POINTER_MAX_BYTES)
  await context.redis.pubClient.set(previewIdIndexKey(roomId, previewId), payload, {
    EX: PREVIEW_ID_TTL_SEC,
  })
}

export async function getPreviewIdRedirect(params: {
  context: AppContext
  roomId: string
  previewId: string
}): Promise<PreviewIdRecord | null> {
  const { context, roomId, previewId } = params
  try {
    const raw = await context.redis.pubClient.get(previewIdIndexKey(roomId, previewId))
    if (!raw) return null
    // Legacy: value was plain trackId pointing at a base64 blob hash
    if (!raw.startsWith("{")) {
      return null
    }
    const parsed = JSON.parse(raw) as PreviewIdRecord
    if (!parsed?.url) return null
    return parsed
  } catch (e) {
    console.error("ERROR FROM data/trackPreviews/getPreviewIdRedirect", roomId, previewId, e)
    return null
  }
}

/** @deprecated Prefer MediaObjectCache pointers; kept for legacy GET serving. */
export async function getTrackPreviewByPreviewId(params: {
  context: AppContext
  roomId: string
  previewId: string
}): Promise<{ data?: string; mimeType: string; url?: string; trackId?: string } | null> {
  const redirect = await getPreviewIdRedirect(params)
  if (redirect) {
    return { url: redirect.url, mimeType: redirect.mimeType, trackId: redirect.trackId }
  }
  return null
}

export type TrackPreviewGenerationResult =
  | { ok: true; url: string; durationMs: number; previewId: string }
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
  void promise
    .finally(() => {
      if (inFlightGeneration.get(key) === promise) {
        inFlightGeneration.delete(key)
      }
    })
    .catch(() => {})
}

export { PREVIEW_ID_TTL_SEC as PREVIEW_TTL_SEC }
