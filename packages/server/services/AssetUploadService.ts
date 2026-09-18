import { randomUUID } from "crypto"
import { PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import type {
  PresignNewsletterUploadRequest,
  PresignNewsletterUploadResponse,
} from "@repo/types"
import { NewsletterBadRequestError } from "./NewsletterService"
import { getAssetS3Client, sanitizeFilename } from "../lib/s3Presign"
import {
  getAssetBucket as readAssetBucket,
  getAssetCdnBaseUrl as readAssetCdnBaseUrl,
} from "../lib/assetEnv"

const PRESIGN_EXPIRES_SECONDS = 15 * 60
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
])

function requireAssetBucket(): string {
  try {
    return readAssetBucket()
  } catch {
    throw new NewsletterBadRequestError("ASSET_S3_BUCKET is not configured")
  }
}

function requireAssetCdnBaseUrl(): string {
  try {
    return readAssetCdnBaseUrl()
  } catch {
    throw new NewsletterBadRequestError("ASSET_CDN_BASE_URL is not configured")
  }
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

  const bucket = requireAssetBucket()
  const cdnBase = requireAssetCdnBaseUrl()
  const key = `newsletter/${randomUUID()}/${randomUUID()}-${sanitizeFilename(filename, "image")}`

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  })

  const uploadUrl = await getSignedUrl(getAssetS3Client(), command, {
    expiresIn: PRESIGN_EXPIRES_SECONDS,
  })

  return {
    uploadUrl,
    publicUrl: `${cdnBase}/${key}`,
    key,
  }
}
