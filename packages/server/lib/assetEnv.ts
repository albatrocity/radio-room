/**
 * Shared asset-bucket env helpers (newsletter, music upload, media object cache).
 * Throw a plain Error so callers can map to domain errors.
 */

export function getAssetBucket(): string {
  const bucket = process.env.ASSET_S3_BUCKET?.trim()
  if (!bucket) {
    throw new Error("ASSET_S3_BUCKET is not configured")
  }
  return bucket
}

export function getAssetCdnBaseUrl(): string {
  const base = process.env.ASSET_CDN_BASE_URL?.trim()
  if (!base) {
    throw new Error("ASSET_CDN_BASE_URL is not configured")
  }
  return base.replace(/\/$/, "")
}
