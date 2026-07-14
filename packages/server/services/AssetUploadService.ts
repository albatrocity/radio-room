import { randomUUID } from "crypto"
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import type {
  PresignNewsletterUploadRequest,
  PresignNewsletterUploadResponse,
} from "@repo/types"
import { NewsletterBadRequestError } from "./NewsletterService"

const PRESIGN_EXPIRES_SECONDS = 15 * 60
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
])

function getAwsRegion(): string {
  return process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1"
}

function getAssetBucket(): string {
  const bucket = process.env.ASSET_S3_BUCKET?.trim()
  if (!bucket) {
    throw new NewsletterBadRequestError("ASSET_S3_BUCKET is not configured")
  }
  return bucket
}

function getAssetCdnBaseUrl(): string {
  const base = process.env.ASSET_CDN_BASE_URL?.trim()
  if (!base) {
    throw new NewsletterBadRequestError("ASSET_CDN_BASE_URL is not configured")
  }
  return base.replace(/\/$/, "")
}

let s3Client: S3Client | null = null
function getS3Client(): S3Client {
  if (!s3Client) {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim()
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim()
    s3Client = new S3Client({
      region: getAwsRegion(),
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    })
  }
  return s3Client
}

function sanitizeFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop()?.trim() || "image"
  const sanitized = base.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-")
  return sanitized.slice(0, 120) || "image"
}

function assertImageContentType(contentType: string): void {
  const normalized = contentType.trim().toLowerCase()
  if (!ALLOWED_IMAGE_TYPES.has(normalized)) {
    throw new NewsletterBadRequestError(
      `Unsupported content type "${contentType}". Allowed: ${Array.from(ALLOWED_IMAGE_TYPES).join(", ")}`,
    )
  }
}

/**
 * Issue a short-lived S3 PUT URL for newsletter markdown image uploads.
 * The browser uploads directly to S3; the returned publicUrl is the CloudFront URL.
 */
export async function createPresignedUpload(
  input: PresignNewsletterUploadRequest,
): Promise<PresignNewsletterUploadResponse> {
  const filename = typeof input.filename === "string" ? input.filename.trim() : ""
  const contentType =
    typeof input.contentType === "string" ? input.contentType.trim().toLowerCase() : ""

  if (!filename) {
    throw new NewsletterBadRequestError("filename is required")
  }
  if (!contentType) {
    throw new NewsletterBadRequestError("contentType is required")
  }
  assertImageContentType(contentType)

  const bucket = getAssetBucket()
  const cdnBase = getAssetCdnBaseUrl()
  const key = `newsletter/${randomUUID()}/${randomUUID()}-${sanitizeFilename(filename)}`

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  })

  const uploadUrl = await getSignedUrl(getS3Client(), command, {
    expiresIn: PRESIGN_EXPIRES_SECONDS,
  })

  return {
    uploadUrl,
    publicUrl: `${cdnBase}/${key}`,
    key,
  }
}
