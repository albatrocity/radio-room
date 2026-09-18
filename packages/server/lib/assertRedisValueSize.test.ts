import { describe, expect, it } from "vitest"
import {
  assertRedisValueSize,
  REDIS_BLOB_MAX_BYTES,
  RedisValueTooLargeError,
} from "./assertRedisValueSize"

describe("assertRedisValueSize", () => {
  it("allows values at or under the ceiling", () => {
    expect(() => assertRedisValueSize("test", "small")).not.toThrow()
    expect(() =>
      assertRedisValueSize("test", "x".repeat(REDIS_BLOB_MAX_BYTES), REDIS_BLOB_MAX_BYTES),
    ).not.toThrow()
  })

  it("refuses oversized UTF-8 values with a typed error", () => {
    const value = "x".repeat(REDIS_BLOB_MAX_BYTES + 1)
    expect(() => assertRedisValueSize("storeImage", value)).toThrow(RedisValueTooLargeError)
    try {
      assertRedisValueSize("storeImage", value)
    } catch (e) {
      expect(e).toBeInstanceOf(RedisValueTooLargeError)
      const err = e as RedisValueTooLargeError
      expect(err.label).toBe("storeImage")
      expect(err.sizeBytes).toBe(REDIS_BLOB_MAX_BYTES + 1)
      expect(err.maxBytes).toBe(REDIS_BLOB_MAX_BYTES)
    }
  })

  it("counts multi-byte UTF-8 correctly", () => {
    // each emoji is 4 bytes
    const value = "😀".repeat(3)
    expect(() => assertRedisValueSize("emoji", value, 11)).toThrow(RedisValueTooLargeError)
    expect(() => assertRedisValueSize("emoji", value, 12)).not.toThrow()
  })
})
