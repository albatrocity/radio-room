import type { AppContext } from "@repo/types"
import * as scheduling from "../services/SchedulingService"
import { ensureSegmentImageObject } from "../services/MediaObjectCache"
import { getAssetBucket, getAssetCdnBaseUrl } from "../lib/assetEnv"
import { prepareRoomImage, PrepareRoomImageError } from "./data/prepareRoomImage"
import { afterSegmentChanged } from "./segmentChanged"

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

  await afterSegmentChanged(context, segmentId, { refreshStreamingDisplay: true })
  return segment
}

export async function clearSegmentImage(params: {
  context: AppContext | undefined
  segmentId: string
}) {
  const segment = await scheduling.setSegmentImageUrl(params.segmentId, null)
  if (!segment) throw new SegmentImageError("Segment not found", 404)

  await afterSegmentChanged(params.context, params.segmentId, { refreshStreamingDisplay: true })
  return segment
}
