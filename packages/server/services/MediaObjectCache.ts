/**
 * S3 media object cache with Redis URL pointers (ADR 0186).
 */
import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3"
import type { AppContext, SimpleCache } from "@repo/types"
import { getAssetS3Client } from "../lib/s3Presign"
import { getAssetBucket, getAssetCdnBaseUrl } from "../lib/assetEnv"
import {
  coverObjectKey,
  coverPointerKey,
  hashCoverBytes,
  idFallbackPreviewPointerKey,
  previewObjectKey,
  previewPointerKey,
  roomImageObjectKey,
} from "./mediaFingerprint"

const COVER_TTL_SEC = 30 * 24 * 60 * 60
const COVER_NEGATIVE_TTL_SEC = 7 * 24 * 60 * 60
const PREVIEW_TTL_SEC = 7 * 24 * 60 * 60
const ROOM_IMAGE_PTR_TTL_SEC = 90 * 24 * 60 * 60

export type CoverPointer = { url: string } | { none: true }
export type PreviewPointer = { url: string; mimeType: string; durationMs: number }
export type RoomImagePointer = { url: string; mimeType: string }

/** ±20% so a catalog written in one hydrate does not expire in one batch. */
export function jitterTtl(ttlSeconds: number): number {
  return Math.round(ttlSeconds * (0.8 + Math.random() * 0.4))
}

async function objectExists(bucket: string, key: string): Promise<boolean> {
  try {
    await getAssetS3Client().send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return true
  } catch (e: unknown) {
    const err = e as { name?: string; $metadata?: { httpStatusCode?: number } }
    if (err?.name === "NotFound" || err?.$metadata?.httpStatusCode === 404) {
      return false
    }
    throw e
  }
}

async function putObject(params: {
  bucket: string
  key: string
  body: Buffer
  contentType: string
}): Promise<void> {
  await getAssetS3Client().send(
    new PutObjectCommand({
      Bucket: params.bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  )
}

function cdnUrl(key: string): string {
  return `${getAssetCdnBaseUrl()}/${key}`
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

async function writePointer(
  cache: SimpleCache | undefined,
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  if (!cache) return
  await cache.set(key, JSON.stringify(value), jitterTtl(ttlSeconds))
}

export function coverPointerCachePrefix(libraryId: string): string {
  return `media:ptr:v1:cover:${libraryId}:`
}

export async function getCoverPointer(params: {
  context: AppContext
  libraryId: string
  identityHash: string
  variant: "sm" | "lg"
}): Promise<CoverPointer | null> {
  const key = coverPointerKey(params.libraryId, params.identityHash, params.variant)
  const raw = params.context.cache ? await params.context.cache.get(key) : null
  const parsed = parseJson<CoverPointer>(raw)
  if (!parsed) return null
  const ttl =
    "none" in parsed && parsed.none ? COVER_NEGATIVE_TTL_SEC : COVER_TTL_SEC
  await writePointer(params.context.cache, key, parsed, ttl)
  return parsed
}

export async function setCoverPointer(params: {
  context: AppContext
  libraryId: string
  identityHash: string
  variant: "sm" | "lg"
  pointer: CoverPointer
}): Promise<void> {
  const key = coverPointerKey(params.libraryId, params.identityHash, params.variant)
  const ttl =
    "none" in params.pointer && params.pointer.none
      ? COVER_NEGATIVE_TTL_SEC
      : COVER_TTL_SEC
  await writePointer(params.context.cache, key, params.pointer, ttl)
}

/**
 * Ensure cover bytes are in S3; return CDN URL. Skips Put when Head hits.
 */
export async function ensureCoverObject(params: {
  context: AppContext
  libraryId: string
  identityHash: string
  variant: "sm" | "lg"
  base64Data: string
  mimeType?: string
}): Promise<{ url: string; contentHash: string; uploaded: boolean }> {
  const contentHash = hashCoverBytes(params.base64Data)
  const key = coverObjectKey(contentHash, params.variant)
  const bucket = getAssetBucket()
  const exists = await objectExists(bucket, key)
  if (!exists) {
    await putObject({
      bucket,
      key,
      body: Buffer.from(params.base64Data, "base64"),
      contentType: params.mimeType || "image/jpeg",
    })
  }
  const url = cdnUrl(key)
  await setCoverPointer({
    context: params.context,
    libraryId: params.libraryId,
    identityHash: params.identityHash,
    variant: params.variant,
    pointer: { url },
  })
  return { url, contentHash, uploaded: !exists }
}

export async function getPreviewPointer(params: {
  context: AppContext
  fingerprintHash: string | null
  libraryId?: string
  trackId?: string
}): Promise<PreviewPointer | null> {
  const key = params.fingerprintHash
    ? previewPointerKey(params.fingerprintHash)
    : params.libraryId && params.trackId
      ? idFallbackPreviewPointerKey(params.libraryId, params.trackId)
      : null
  if (!key) return null
  const raw = params.context.cache ? await params.context.cache.get(key) : null
  const parsed = parseJson<PreviewPointer>(raw)
  if (!parsed?.url) return null
  await writePointer(params.context.cache, key, parsed, PREVIEW_TTL_SEC)
  return parsed
}

/**
 * Head/Put preview clip; set fingerprint or id-fallback pointer.
 */
export async function ensurePreviewObject(params: {
  context: AppContext
  fingerprintHash: string | null
  libraryId?: string
  trackId?: string
  base64Data: string
  mimeType: string
  durationMs: number
}): Promise<{ url: string; uploaded: boolean }> {
  const bucket = getAssetBucket()
  let key: string
  if (params.fingerprintHash) {
    key = previewObjectKey(params.fingerprintHash)
  } else if (params.libraryId && params.trackId) {
    // No sharing across libraries — still keep bytes out of Redis
    key = `media/previews/v1/id/${params.libraryId}/${params.trackId}.mp3`
  } else {
    throw new Error("ensurePreviewObject requires fingerprintHash or libraryId+trackId")
  }

  const exists = await objectExists(bucket, key)
  if (!exists) {
    await putObject({
      bucket,
      key,
      body: Buffer.from(params.base64Data, "base64"),
      contentType: params.mimeType || "audio/mpeg",
    })
  }
  const url = cdnUrl(key)
  const pointer: PreviewPointer = {
    url,
    mimeType: params.mimeType || "audio/mpeg",
    durationMs: params.durationMs,
  }
  const pointerKey = params.fingerprintHash
    ? previewPointerKey(params.fingerprintHash)
    : idFallbackPreviewPointerKey(params.libraryId!, params.trackId!)
  await writePointer(params.context.cache, pointerKey, pointer, PREVIEW_TTL_SEC)
  return { url, uploaded: !exists }
}

/**
 * HeadObject for an existing fingerprint without bytes (cross-library reuse).
 */
export async function headPreviewByFingerprint(params: {
  context: AppContext
  fingerprintHash: string
}): Promise<PreviewPointer | null> {
  const key = previewObjectKey(params.fingerprintHash)
  const bucket = getAssetBucket()
  const exists = await objectExists(bucket, key)
  if (!exists) return null
  const pointer: PreviewPointer = {
    url: cdnUrl(key),
    mimeType: "audio/mpeg",
    durationMs: 15_000,
  }
  await writePointer(
    params.context.cache,
    previewPointerKey(params.fingerprintHash),
    pointer,
    PREVIEW_TTL_SEC,
  )
  return pointer
}

export async function ensureRoomImageObject(params: {
  context: AppContext
  roomId: string
  buffer: Buffer
  mimeType: string
}): Promise<{ url: string; contentHash: string; uploaded: boolean }> {
  const contentHash = hashCoverBytes(params.buffer)
  const ext = params.mimeType.includes("png")
    ? "png"
    : params.mimeType.includes("gif")
      ? "gif"
      : params.mimeType.includes("webp")
        ? "webp"
        : "jpg"
  const key = roomImageObjectKey(params.roomId, contentHash, ext)
  const bucket = getAssetBucket()
  const exists = await objectExists(bucket, key)
  if (!exists) {
    await putObject({
      bucket,
      key,
      body: params.buffer,
      contentType: params.mimeType,
    })
  }
  const url = cdnUrl(key)
  const ptrKey = `media:ptr:v1:room-image:${params.roomId}:${contentHash}`
  await writePointer(
    params.context.cache,
    ptrKey,
    { url, mimeType: params.mimeType } satisfies RoomImagePointer,
    ROOM_IMAGE_PTR_TTL_SEC,
  )
  return { url, contentHash, uploaded: !exists }
}

export async function invalidateCoverPointersForLibrary(
  context: AppContext,
  libraryId: string,
): Promise<void> {
  await context.cache?.deleteByPrefix(coverPointerCachePrefix(libraryId))
}