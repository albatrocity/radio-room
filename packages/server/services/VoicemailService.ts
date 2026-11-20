import crypto from "crypto"
import { randomUUID } from "crypto"
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3"
import type { S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { and, desc, eq, gte, lt } from "drizzle-orm"
import { db, voicemail } from "@repo/db"
import {
  VOICEMAIL_ALLOWED_CONTENT_TYPES,
  VOICEMAIL_LABEL_MAX_CHARS,
  VOICEMAIL_LIST_CAP,
  VOICEMAIL_LIST_MAX_SPAN_DAYS,
  VOICEMAIL_MAX_BYTES,
  VOICEMAIL_MAX_DURATION_MS,
  VOICEMAIL_RETENTION_DAYS,
} from "@repo/types"
import type {
  ListVoicemailsResponse,
  PresignVoicemailResponse,
  VoicemailContentType,
  VoicemailListItem,
  VoicemailRow,
} from "@repo/types"
import { getAssetS3Client } from "../lib/s3Presign"
import { getAssetBucket as readAssetBucket } from "../lib/assetEnv"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const VOICEMAIL_PRESIGN_EXPIRES_SECONDS = 60 * 60
export const VOICEMAIL_GET_EXPIRES_SECONDS = 4 * 60 * 60
export const VOICEMAIL_SESSION_TTL_SECONDS = 2 * 60 * 60

export const VOICEMAIL_PRESIGN_LIMIT_PER_HOUR = 10
export const VOICEMAIL_PRESIGN_WINDOW_SEC = 60 * 60
export const VOICEMAIL_COMPLETE_LIMIT_PER_DAY = 3
export const VOICEMAIL_COMPLETE_WINDOW_SEC = 24 * 60 * 60

const ALLOWED_CONTENT_TYPES = new Set<string>(VOICEMAIL_ALLOWED_CONTENT_TYPES)

const EXTENSION_FOR_CONTENT_TYPE: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "mp4",
  "audio/ogg": "ogg",
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class VoicemailBadRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "VoicemailBadRequestError"
  }
}

export class VoicemailNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "VoicemailNotFoundError"
  }
}

export class VoicemailRateLimitedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "VoicemailRateLimitedError"
  }
}

export class VoicemailForbiddenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "VoicemailForbiddenError"
  }
}

// ---------------------------------------------------------------------------
// Env helpers
// ---------------------------------------------------------------------------

function getAssetBucket(): string {
  try {
    return readAssetBucket()
  } catch {
    throw new VoicemailBadRequestError("ASSET_S3_BUCKET is not configured")
  }
}

function getIpHmacSecret(): string {
  const secret = process.env.VOICEMAIL_IP_HMAC_SECRET?.trim()
  if (!secret) {
    // Fail closed: do not fall back to raw IPs or an insecure hash.
    throw new VoicemailBadRequestError(
      "VOICEMAIL_IP_HMAC_SECRET is not configured",
    )
  }
  return secret
}

export function hashClientIp(ip: string): string {
  return crypto
    .createHmac("sha256", getIpHmacSecret())
    .update(`voicemail:${ip}`)
    .digest("hex")
}

// ---------------------------------------------------------------------------
// Redis client shape (subset of node-redis used here)
// ---------------------------------------------------------------------------

/** Subset of `context.redis.pubClient` used by voicemail rate limiting and sessions. */
export interface VoicemailRedisClient {
  get(key: string): Promise<string | null>
  setEx(key: string, ttlSeconds: number, value: string): Promise<unknown>
  del(key: string | string[]): Promise<number>
  incr(key: string): Promise<number>
  expire(key: string, ttlSeconds: number): Promise<unknown>
  ttl(key: string): Promise<number>
}

type RedisHost = { pubClient: VoicemailRedisClient }

// ---------------------------------------------------------------------------
// Session + rate-limit keys
// ---------------------------------------------------------------------------

function sessionRedisKey(uploadId: string): string {
  return `voicemail:upload:${uploadId}`
}

function presignRateKey(ipHmac: string): string {
  return `voicemail:rate:presign:${ipHmac}`
}

function completeRateKey(ipHmac: string): string {
  return `voicemail:rate:complete:${ipHmac}`
}

export interface VoicemailSession {
  uploadId: string
  key: string
  contentType: VoicemailContentType
  contentLength: number
  durationMs: number
  label: string | null
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/** Strip any `;codecs=...` / `;foo=bar` parameters to get the base MIME. */
export function normalizeContentType(raw: string): string {
  if (typeof raw !== "string") return ""
  return raw.split(";")[0]!.trim().toLowerCase()
}

export function normalizeLabel(raw: string | null | undefined): string | null {
  if (raw == null) return null
  if (typeof raw !== "string") return null
  // Strip C0 controls (0x00–0x1F) and DEL (0x7F).
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, "").trim()
  if (!cleaned) return null
  return cleaned.slice(0, VOICEMAIL_LABEL_MAX_CHARS)
}

function assertContentType(
  normalized: string,
): asserts normalized is VoicemailContentType {
  if (!ALLOWED_CONTENT_TYPES.has(normalized)) {
    throw new VoicemailBadRequestError(
      `Unsupported contentType "${normalized}". Allowed: ${VOICEMAIL_ALLOWED_CONTENT_TYPES.join(", ")}`,
    )
  }
}

function assertContentLength(contentLength: number): void {
  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    throw new VoicemailBadRequestError(
      "contentLength must be a positive number",
    )
  }
  if (contentLength > VOICEMAIL_MAX_BYTES) {
    throw new VoicemailBadRequestError(
      `contentLength exceeds maximum of ${VOICEMAIL_MAX_BYTES} bytes`,
    )
  }
}

function assertDurationMs(durationMs: number): void {
  if (!Number.isFinite(durationMs) || !Number.isInteger(durationMs)) {
    throw new VoicemailBadRequestError("durationMs must be an integer")
  }
  if (durationMs < 1 || durationMs > VOICEMAIL_MAX_DURATION_MS) {
    throw new VoicemailBadRequestError(
      `durationMs must be between 1 and ${VOICEMAIL_MAX_DURATION_MS}`,
    )
  }
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

async function incrementWindow(
  redis: VoicemailRedisClient,
  key: string,
  windowSeconds: number,
): Promise<number> {
  const count = await redis.incr(key)
  if (count === 1) {
    await redis.expire(key, windowSeconds)
  }
  return count
}

async function readCount(
  redis: VoicemailRedisClient,
  key: string,
): Promise<number> {
  const raw = await redis.get(key)
  if (!raw) return 0
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

// ---------------------------------------------------------------------------
// Presign
// ---------------------------------------------------------------------------

export interface CreateVoicemailPresignInput {
  redis: RedisHost
  ip: string
  contentType: string
  contentLength: number
  durationMs: number
  label?: string | null
}

export async function createVoicemailPresign(
  input: CreateVoicemailPresignInput,
): Promise<PresignVoicemailResponse> {
  const contentType = normalizeContentType(input.contentType)
  assertContentType(contentType)
  const contentLength = Number(input.contentLength)
  assertContentLength(contentLength)
  const durationMs = Number(input.durationMs)
  assertDurationMs(durationMs)
  const label = normalizeLabel(input.label ?? null)

  const bucket = getAssetBucket()
  const ipHmac = hashClientIp(input.ip)
  const redis = input.redis.pubClient

  // Reject early if the caller is already at the daily complete cap.
  const completedSoFar = await readCount(redis, completeRateKey(ipHmac))
  if (completedSoFar >= VOICEMAIL_COMPLETE_LIMIT_PER_DAY) {
    throw new VoicemailRateLimitedError(
      "Daily voicemail limit reached. Please try again tomorrow.",
    )
  }

  const presignCount = await incrementWindow(
    redis,
    presignRateKey(ipHmac),
    VOICEMAIL_PRESIGN_WINDOW_SEC,
  )
  if (presignCount > VOICEMAIL_PRESIGN_LIMIT_PER_HOUR) {
    throw new VoicemailRateLimitedError(
      "Too many voicemail attempts. Please try again later.",
    )
  }

  const uploadId = randomUUID()
  const extension = EXTENSION_FOR_CONTENT_TYPE[contentType] ?? "bin"
  const key = `voicemails/v1/${uploadId}.${extension}`

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength,
  })
  const url = await getSignedUrl(getAssetS3Client() as S3Client, command, {
    expiresIn: VOICEMAIL_PRESIGN_EXPIRES_SECONDS,
  })

  const session: VoicemailSession = {
    uploadId,
    key,
    contentType,
    contentLength,
    durationMs,
    label,
  }
  await redis.setEx(
    sessionRedisKey(uploadId),
    VOICEMAIL_SESSION_TTL_SECONDS,
    JSON.stringify(session),
  )

  return {
    uploadId,
    url,
    contentType,
    contentLength,
  }
}

// ---------------------------------------------------------------------------
// Complete
// ---------------------------------------------------------------------------

export interface CompleteVoicemailInput {
  redis: RedisHost
  ip: string
  uploadId: string
}

async function loadSession(
  redis: VoicemailRedisClient,
  uploadId: string,
): Promise<VoicemailSession> {
  const raw = await redis.get(sessionRedisKey(uploadId))
  if (!raw) {
    throw new VoicemailNotFoundError("Upload session not found or expired")
  }
  return JSON.parse(raw) as VoicemailSession
}

async function headVoicemailObject(bucket: string, key: string) {
  try {
    return await (getAssetS3Client() as S3Client).send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
    )
  } catch (e: unknown) {
    const err = e as { name?: string; $metadata?: { httpStatusCode?: number } }
    const status = err?.$metadata?.httpStatusCode
    if (err?.name === "NotFound" || status === 404) {
      throw new VoicemailNotFoundError(
        "Uploaded voicemail file was not found in storage",
      )
    }
    throw e
  }
}

export async function completeVoicemail(
  input: CompleteVoicemailInput,
): Promise<{ ok: true }> {
  const uploadId =
    typeof input.uploadId === "string" ? input.uploadId.trim() : ""
  if (!uploadId) {
    throw new VoicemailBadRequestError("uploadId is required")
  }

  const bucket = getAssetBucket()
  const ipHmac = hashClientIp(input.ip)
  const redis = input.redis.pubClient

  // Second rate-limit check: presign-side can be raced by submitting multiple
  // presigns in parallel and then completing them all.
  const currentCompleted = await readCount(redis, completeRateKey(ipHmac))
  if (currentCompleted >= VOICEMAIL_COMPLETE_LIMIT_PER_DAY) {
    throw new VoicemailRateLimitedError(
      "Daily voicemail limit reached. Please try again tomorrow.",
    )
  }

  const session = await loadSession(redis, uploadId)

  const head = await headVoicemailObject(bucket, session.key)

  if (typeof head.ContentLength === "number" && head.ContentLength !== session.contentLength) {
    throw new VoicemailBadRequestError(
      "Uploaded file size does not match the presigned request",
    )
  }
  if (head.ContentType) {
    const headType = normalizeContentType(head.ContentType)
    if (headType !== session.contentType) {
      throw new VoicemailBadRequestError(
        "Uploaded file content type does not match the presigned request",
      )
    }
  }

  // Re-count AFTER head confirms, but BEFORE the insert so a racing second
  // complete sees the increment immediately.
  const nextCount = await incrementWindow(
    redis,
    completeRateKey(ipHmac),
    VOICEMAIL_COMPLETE_WINDOW_SEC,
  )
  if (nextCount > VOICEMAIL_COMPLETE_LIMIT_PER_DAY) {
    throw new VoicemailRateLimitedError(
      "Daily voicemail limit reached. Please try again tomorrow.",
    )
  }

  await db.insert(voicemail).values({
    id: session.uploadId,
    s3Key: session.key,
    contentType: session.contentType,
    byteSize: session.contentLength,
    durationMs: session.durationMs,
    label: session.label,
    status: "ready",
  })

  await redis.del(sessionRedisKey(uploadId))

  return { ok: true }
}

// ---------------------------------------------------------------------------
// Admin read path (list / presigned GET / hide)
// ---------------------------------------------------------------------------

export interface ListVoicemailsInput {
  from: string
  to: string
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

function parseIsoInstant(value: string, label: string): Date {
  if (typeof value !== "string" || !value) {
    throw new VoicemailBadRequestError(`${label} is required`)
  }
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) {
    throw new VoicemailBadRequestError(`${label} must be an ISO timestamp`)
  }
  return d
}

export async function listVoicemails(
  input: ListVoicemailsInput,
): Promise<ListVoicemailsResponse> {
  const from = parseIsoInstant(input.from, "from")
  const to = parseIsoInstant(input.to, "to")

  if (!(from.getTime() < to.getTime())) {
    throw new VoicemailBadRequestError("from must be before to")
  }

  const spanMs = to.getTime() - from.getTime()
  if (spanMs > VOICEMAIL_LIST_MAX_SPAN_DAYS * MS_PER_DAY) {
    throw new VoicemailBadRequestError(
      `Range exceeds maximum span of ${VOICEMAIL_LIST_MAX_SPAN_DAYS} days`,
    )
  }

  const retentionEdge = Date.now() - VOICEMAIL_RETENTION_DAYS * MS_PER_DAY
  if (from.getTime() < retentionEdge) {
    throw new VoicemailBadRequestError(
      `from is older than the ${VOICEMAIL_RETENTION_DAYS}-day retention window`,
    )
  }

  const rows = await db
    .select({
      id: voicemail.id,
      createdAt: voicemail.createdAt,
      s3Key: voicemail.s3Key,
      durationMs: voicemail.durationMs,
      label: voicemail.label,
    })
    .from(voicemail)
    .where(
      and(
        eq(voicemail.status, "ready"),
        gte(voicemail.createdAt, from),
        lt(voicemail.createdAt, to),
      ),
    )
    .orderBy(desc(voicemail.createdAt))
    .limit(VOICEMAIL_LIST_CAP + 1)

  const truncated = rows.length > VOICEMAIL_LIST_CAP
  const limited = truncated ? rows.slice(0, VOICEMAIL_LIST_CAP) : rows

  const bucket = getAssetBucket()
  const items: VoicemailListItem[] = await Promise.all(
    limited.map(async (row) => {
      const url = await getSignedUrl(
        getAssetS3Client() as S3Client,
        new GetObjectCommand({ Bucket: bucket, Key: row.s3Key }),
        { expiresIn: VOICEMAIL_GET_EXPIRES_SECONDS },
      )
      return {
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        durationMs: row.durationMs,
        label: row.label,
        url,
      }
    }),
  )

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    truncated,
    items,
  }
}

export async function hideVoicemail(id: string): Promise<void> {
  if (typeof id !== "string" || !id) {
    throw new VoicemailBadRequestError("id is required")
  }
  const [row] = await db
    .update(voicemail)
    .set({ status: "hidden" })
    .where(eq(voicemail.id, id))
    .returning({ id: voicemail.id })
  if (!row) {
    throw new VoicemailNotFoundError("Voicemail not found")
  }
}

export interface VoicemailPresignedGet {
  row: VoicemailRow
  url: string
}

export async function getVoicemailPresignedGet(
  id: string,
): Promise<VoicemailPresignedGet> {
  if (typeof id !== "string" || !id) {
    throw new VoicemailBadRequestError("id is required")
  }
  const [row] = await db
    .select()
    .from(voicemail)
    .where(and(eq(voicemail.id, id), eq(voicemail.status, "ready")))
    .limit(1)

  if (!row) {
    throw new VoicemailNotFoundError("Voicemail not found")
  }

  const bucket = getAssetBucket()
  const url = await getSignedUrl(
    getAssetS3Client() as S3Client,
    new GetObjectCommand({ Bucket: bucket, Key: row.s3Key }),
    { expiresIn: VOICEMAIL_GET_EXPIRES_SECONDS },
  )

  const mapped: VoicemailRow = {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    s3Key: row.s3Key,
    contentType: row.contentType,
    byteSize: row.byteSize,
    durationMs: row.durationMs,
    label: row.label,
    status: row.status,
  }

  return { row: mapped, url }
}
