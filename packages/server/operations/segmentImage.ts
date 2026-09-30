import type { AppContext } from "@repo/types"
import * as scheduling from "../services/SchedulingService"
import { ensureSegmentImageObject } from "../services/MediaObjectCache"
import { getAssetBucket, getAssetCdnBaseUrl } from "../lib/assetEnv"
import { isStreamingMode } from "../lib/streamingMode"
import { findRoom } from "./data"
import { prepareRoomImage, PrepareRoomImageError } from "./data/prepareRoomImage"
import { enterStreamingMode } from "./room/applyFetchMetaTransitionEffects"
import { refreshRoomScheduleSnapshot } from "./scheduleRedisSnapshot"
import { findRoomIdsByShowId } from "./showPublish"

export class SegmentImageError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = "SegmentImageError"
  }
}

function assertAssetStorageConfigured(): void {
  try {
    getAssetBucket()
    getAssetCdnBaseUrl()
  } catch (e) {
    throw new SegmentImageError(e instanceof Error ? e.message : "Asset storage is not configured", 503)
  }
}

/**
 * Refresh schedule snapshots for rooms attached to shows containing the segment,
 * then rebuild the streaming-mode display where that segment is active.
 * Failures are logged; the primary mutation already succeeded (ADR 0028).
 */
export async function afterSegmentImageChanged(
  context: AppContext | undefined,
  segmentId: string,
): Promise<void> {
  if (!context) return
  try {
    const showIds = await scheduling.findShowIdsBySegmentId(segmentId)
    for (const showId of showIds) {
      const roomIds = await findRoomIdsByShowId(context, showId)
      for (const roomId of roomIds) {
        await refreshRoomScheduleSnapshot(context, roomId)
        const room = await findRoom({ context, roomId })
        if (room?.activeSegmentId === segmentId && isStreamingMode(room)) {
          await enterStreamingMode(context, roomId)
        }
      }
    }
  } catch (e) {
    console.error("[segmentImage] refresh after image change failed", segmentId, e)
  }
}

export async function uploadSegmentImage(params: {
  context: AppContext | undefined
  segmentId: string
  file: { buffer: Buffer; mimetype: string; originalname: string }
}) {
  const { context, segmentId, file } = params

  const existing = await scheduling.findSegmentById(segmentId)
  if (!existing) throw new SegmentImageError("Segment not found", 404)

  assertAssetStorageConfigured()

  let prepared
  try {
    prepared = await prepareRoomImage(file.buffer, file.mimetype, file.originalname)
  } catch (e) {
    if (e instanceof PrepareRoomImageError) throw new SegmentImageError(e.message, 400)
    throw e
  }

  const { url } = await ensureSegmentImageObject({
    buffer: prepared.buffer,
    mimeType: prepared.mimeType,
  })

  const segment = await scheduling.setSegmentImageUrl(segmentId, url)
  if (!segment) throw new SegmentImageError("Segment not found", 404)

  await afterSegmentImageChanged(context, segmentId)
  return segment
}

export async function clearSegmentImage(params: {
  context: AppContext | undefined
  segmentId: string
}) {
  const segment = await scheduling.setSegmentImageUrl(params.segmentId, null)
  if (!segment) throw new SegmentImageError("Segment not found", 404)

  await afterSegmentImageChanged(params.context, params.segmentId)
  return segment
}
