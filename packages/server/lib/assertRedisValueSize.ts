/**
 * Refuse oversized Redis string values instead of letting them OOM a live show.
 * Measure UTF-8 bytes (Buffer.byteLength), not JS string length.
 */

/** While Redis blob fallback exists for S3 outages; prefer 8KB once only pointers remain. */
export const REDIS_BLOB_MAX_BYTES = 256 * 1024

/** Pointer / metadata values after S3 cutover. */
export const REDIS_POINTER_MAX_BYTES = 8 * 1024

export class RedisValueTooLargeError extends Error {
  readonly label: string
  readonly sizeBytes: number
  readonly maxBytes: number

  constructor(label: string, sizeBytes: number, maxBytes: number) {
    super(
      `Redis value too large for ${label}: ${sizeBytes} bytes (max ${maxBytes})`,
    )
    this.name = "RedisValueTooLargeError"
    this.label = label
    this.sizeBytes = sizeBytes
    this.maxBytes = maxBytes
  }
}

export function assertRedisValueSize(
  label: string,
  value: string,
  maxBytes: number = REDIS_BLOB_MAX_BYTES,
): void {
  const sizeBytes = Buffer.byteLength(value, "utf8")
  if (sizeBytes > maxBytes) {
    console.error(
      `[assertRedisValueSize] refused ${label}: ${sizeBytes} bytes > ${maxBytes}`,
    )
    throw new RedisValueTooLargeError(label, sizeBytes, maxBytes)
  }
}
