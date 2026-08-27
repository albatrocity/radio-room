import { S3Client } from "@aws-sdk/client-s3"

let s3Client: S3Client | null = null

function getAwsRegion(): string {
  return process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1"
}

/**
 * Shared S3 client for asset-bucket presigned PUTs (newsletter images, music uploads).
 *
 * Default CRC32 checksums get hoisted onto presigned URLs as query params
 * (`x-amz-checksum-crc32=AAAAAA==`) and break browser PUTs. Only sign a
 * checksum when the caller explicitly asks for one.
 */
export function getAssetS3Client(): S3Client {
  if (!s3Client) {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim()
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim()
    s3Client = new S3Client({
      region: getAwsRegion(),
      requestChecksumCalculation: "WHEN_REQUIRED",
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    })
  }
  return s3Client
}

export function sanitizeFilename(filename: string, fallback = "upload"): string {
  const base = filename.split(/[/\\]/).pop()?.trim() || fallback
  const sanitized = base.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-")
  return sanitized.slice(0, 120) || fallback
}
