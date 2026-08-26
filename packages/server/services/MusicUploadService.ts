import { randomUUID } from "crypto"
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import type {
  CompleteMusicUploadRequest,
  FailMusicUploadRequest,
  PresignMusicUploadRequest,
  PresignMusicUploadResponse,
} from "@repo/types"

export const MUSIC_UPLOAD_MAX_BYTES = 800 * 1024 * 1024
export const MUSIC_UPLOAD_PRESIGN_EXPIRES_SECONDS = 60 * 60
export const MUSIC_UPLOAD_SESSION_TTL_SECONDS = 2 * 60 * 60

const ALLOWED_CONTENT_TYPES = new Set([
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/flac",
  "audio/aiff",
  "audio/mp4",
  "audio/aac",
  "audio/ogg",
  "application/zip",
  "application/x-zip-compressed",
  "application/x-rar-compressed",
  "application/vnd.rar",
  "application/x-7z-compressed",
  "application/octet-stream",
])

const ALLOWED_EXTENSIONS = new Set([
  ".mp3",
  ".wav",
  ".flac",
  ".aiff",
  ".aif",
  ".m4a",
  ".aac",
  ".ogg",
  ".zip",
  ".rar",
  ".7z",
])

export class MusicUploadBadRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MusicUploadBadRequestError"
  }
}

export class MusicUploadForbiddenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MusicUploadForbiddenError"
  }
}

export class MusicUploadNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MusicUploadNotFoundError"
  }
}

export interface MusicUploadSession {
  uploadId: string
  roomId: string
  userId: string
  key: string
  status: "pending" | "completed" | "failed"
}

function getAwsRegion(): string {
  return process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1"
}

function getAssetBucket(): string {
  const bucket = process.env.ASSET_S3_BUCKET?.trim()
  if (!bucket) {
    throw new MusicUploadBadRequestError("ASSET_S3_BUCKET is not configured")
  }
  return bucket
}

let s3Client: S3Client | null = null
function getS3Client(): S3Client {
  if (!s3Client) {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim()
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim()
    s3Client = new S3Client({
      region: getAwsRegion(),
      // Default CRC32 checksums get hoisted onto presigned URLs as query params
      // (x-amz-checksum-crc32=AAAAAA==) and break browser PUTs. Only sign a
      // checksum when the caller explicitly asks for one.
      requestChecksumCalculation: "WHEN_REQUIRED",
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    })
  }
  return s3Client
}

export function sanitizeFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop()?.trim() || "upload"
  const sanitized = base.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-")
  return sanitized.slice(0, 120) || "upload"
}

export function sanitizeUsernameSegment(username: string | undefined, userId: string): string {
  const raw = (username?.trim() || userId).slice(0, 64)
  const sanitized = raw.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-")
  return sanitized || userId
}

function fileExtension(filename: string): string {
  const dot = filename.lastIndexOf(".")
  if (dot <= 0) return ""
  return filename.slice(dot).toLowerCase()
}

export function assertAllowedUpload(filename: string, contentType: string, contentLength: number): void {
  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    throw new MusicUploadBadRequestError("contentLength must be a positive number")
  }
  if (contentLength > MUSIC_UPLOAD_MAX_BYTES) {
    throw new MusicUploadBadRequestError(
      `File exceeds maximum size of ${MUSIC_UPLOAD_MAX_BYTES} bytes`,
    )
  }

  const normalizedType = contentType.trim().toLowerCase()
  const ext = fileExtension(filename)
  const typeAllowed = ALLOWED_CONTENT_TYPES.has(normalizedType)
  const extAllowed = ext !== "" && ALLOWED_EXTENSIONS.has(ext)

  if (!typeAllowed && !extAllowed) {
    throw new MusicUploadBadRequestError(
      `Unsupported file type "${contentType}" / extension "${ext || "none"}". Allowed: audio and zip/rar/7z archives.`,
    )
  }
}

export function buildMusicUploadKey(
  username: string | undefined,
  userId: string,
  filename: string,
): string {
  const date = new Date().toISOString().slice(0, 10)
  const userSegment = sanitizeUsernameSegment(username, userId)
  const safeName = sanitizeFilename(filename)
  return `uploads/${userSegment}/${date}/${userId}/${randomUUID()}-${safeName}`
}

function sessionRedisKey(roomId: string, uploadId: string): string {
  return `room:${roomId}:music-upload:${uploadId}`
}

export async function createMusicUploadPresign(
  redis: { pubClient: { setEx: (key: string, ttl: number, value: string) => Promise<unknown> } },
  input: PresignMusicUploadRequest & {
    roomId: string
    userId: string
    username?: string
  },
): Promise<PresignMusicUploadResponse> {
  const filename = typeof input.filename === "string" ? input.filename.trim() : ""
  const contentType =
    typeof input.contentType === "string" ? input.contentType.trim().toLowerCase() : ""
  const contentLength = Number(input.contentLength)

  if (!filename) {
    throw new MusicUploadBadRequestError("filename is required")
  }
  if (!contentType) {
    throw new MusicUploadBadRequestError("contentType is required")
  }

  assertAllowedUpload(filename, contentType, contentLength)

  const bucket = getAssetBucket()
  const key = buildMusicUploadKey(input.username, input.userId, filename)
  const uploadId = randomUUID()

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength,
  })

  const uploadUrl = await getSignedUrl(getS3Client(), command, {
    expiresIn: MUSIC_UPLOAD_PRESIGN_EXPIRES_SECONDS,
  })

  const session: MusicUploadSession = {
    uploadId,
    roomId: input.roomId,
    userId: input.userId,
    key,
    status: "pending",
  }

  await redis.pubClient.setEx(
    sessionRedisKey(input.roomId, uploadId),
    MUSIC_UPLOAD_SESSION_TTL_SECONDS,
    JSON.stringify(session),
  )

  return {
    uploadUrl,
    key,
    uploadId,
    expiresIn: MUSIC_UPLOAD_PRESIGN_EXPIRES_SECONDS,
  }
}

async function loadSession(
  redis: { pubClient: { get: (key: string) => Promise<string | null> } },
  roomId: string,
  uploadId: string,
): Promise<MusicUploadSession> {
  const raw = await redis.pubClient.get(sessionRedisKey(roomId, uploadId))
  if (!raw) {
    throw new MusicUploadNotFoundError("Upload session not found or expired")
  }
  return JSON.parse(raw) as MusicUploadSession
}

export async function completeMusicUploadSession(
  redis: {
    pubClient: {
      get: (key: string) => Promise<string | null>
      setEx: (key: string, ttl: number, value: string) => Promise<unknown>
    }
  },
  roomId: string,
  userId: string,
  input: CompleteMusicUploadRequest,
): Promise<MusicUploadSession> {
  const session = await loadSession(redis, roomId, input.uploadId)
  if (session.userId !== userId) {
    throw new MusicUploadForbiddenError("Upload session does not belong to this user")
  }
  if (session.key !== input.key) {
    throw new MusicUploadBadRequestError("key does not match upload session")
  }

  const completed: MusicUploadSession = { ...session, status: "completed" }
  await redis.pubClient.setEx(
    sessionRedisKey(roomId, input.uploadId),
    300,
    JSON.stringify(completed),
  )
  return completed
}

export async function failMusicUploadSession(
  redis: {
    pubClient: {
      get: (key: string) => Promise<string | null>
      setEx: (key: string, ttl: number, value: string) => Promise<unknown>
    }
  },
  roomId: string,
  userId: string,
  input: FailMusicUploadRequest,
): Promise<MusicUploadSession> {
  const session = await loadSession(redis, roomId, input.uploadId)
  if (session.userId !== userId) {
    throw new MusicUploadForbiddenError("Upload session does not belong to this user")
  }
  if (session.key !== input.key) {
    throw new MusicUploadBadRequestError("key does not match upload session")
  }

  const failed: MusicUploadSession = { ...session, status: "failed" }
  await redis.pubClient.setEx(
    sessionRedisKey(roomId, input.uploadId),
    300,
    JSON.stringify(failed),
  )
  return failed
}
