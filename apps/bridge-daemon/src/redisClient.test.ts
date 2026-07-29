import { describe, expect, it } from "vitest"
import { parseRedisUrl } from "./redisClient"

describe("parseRedisUrl", () => {
  it("strips /#insecure and flags insecure TLS", () => {
    const r = parseRedisUrl("rediss://:secret@example.com:6380/#insecure")
    expect(r.insecureTls).toBe(true)
    expect(r.url).toBe("rediss://:secret@example.com:6380")
  })

  it("strips #insecure without slash", () => {
    const r = parseRedisUrl("rediss://host:6380#insecure")
    expect(r.insecureTls).toBe(true)
    expect(r.url).toBe("rediss://host:6380")
  })

  it("leaves plain redis URLs alone", () => {
    const r = parseRedisUrl("redis://127.0.0.1:6379")
    expect(r.insecureTls).toBe(false)
    expect(r.url).toBe("redis://127.0.0.1:6379")
  })
})
