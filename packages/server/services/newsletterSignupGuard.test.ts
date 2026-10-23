import { describe, expect, it } from "vitest"
import {
  SIGNUP_EMAIL_DAILY_LIMIT,
  SIGNUP_IP_LIMIT,
  SIGNUP_TOKEN_MAX_AGE_MS,
  countSignupAttempt,
  issueSignupToken,
  readSignupToken,
  releaseConfirmationSend,
  reserveConfirmationSend,
  screenSignupRequest,
  type SignupGuardRedis,
} from "./newsletterSignupGuard"
import { renderConfirmPage } from "../routes/newsletterConfirmPage"

const SECRET = "test-secret"
const NOW = 1_800_000_000_000

function createFakeRedis() {
  const values = new Map<string, number | string>()
  const ttls = new Map<string, number>()
  const redis: SignupGuardRedis = {
    async incr(key) {
      const next = Number(values.get(key) ?? 0) + 1
      values.set(key, next)
      return next
    },
    async decr(key) {
      const next = Number(values.get(key) ?? 0) - 1
      values.set(key, next)
      return next
    },
    async expire(key, seconds) {
      ttls.set(key, seconds)
      return true
    },
    async set(key, value, options) {
      if (options.NX && values.has(key)) return null
      values.set(key, value)
      ttls.set(key, options.EX)
      return "OK"
    },
    async del(key) {
      ttls.delete(key)
      return values.delete(key) ? 1 : 0
    },
  }
  return {
    redis,
    values,
    ttls,
    /** Simulate the cooldown key expiring. */
    expireMatching(fragment: string) {
      for (const key of Array.from(values.keys())) {
        if (key.includes(fragment)) values.delete(key)
      }
    },
  }
}

describe("readSignupToken", () => {
  it("rejects a token submitted within 2 seconds", () => {
    const token = issueSignupToken(NOW, SECRET)
    expect(readSignupToken(token, NOW + 500, SECRET)).toBe("too_fast")
  })

  it("accepts a token issued 3 seconds ago", () => {
    const token = issueSignupToken(NOW, SECRET)
    expect(readSignupToken(token, NOW + 3_000, SECRET)).toBe("ok")
  })

  it("rejects an expired token", () => {
    const token = issueSignupToken(NOW, SECRET)
    expect(readSignupToken(token, NOW + SIGNUP_TOKEN_MAX_AGE_MS + 1, SECRET)).toBe("expired")
  })

  it("rejects a token signed with another secret", () => {
    const token = issueSignupToken(NOW, "other-secret")
    expect(readSignupToken(token, NOW + 3_000, SECRET)).toBe("invalid")
  })

  it("rejects a token whose timestamp was edited", () => {
    const [, nonce, signature] = issueSignupToken(NOW, SECRET).split(".")
    const forged = `${NOW - 10_000}.${nonce}.${signature}`
    expect(readSignupToken(forged, NOW + 3_000, SECRET)).toBe("invalid")
  })

  it("reports a missing or malformed token", () => {
    expect(readSignupToken(undefined, NOW, SECRET)).toBe("missing")
    expect(readSignupToken("not-a-token", NOW, SECRET)).toBe("invalid")
  })
})

describe("screenSignupRequest", () => {
  it("continues for a clean request", () => {
    expect(screenSignupRequest({ ipCount: 1, honeypot: "", tokenVerdict: "ok" })).toBe("continue")
  })

  it("drops a filled honeypot", () => {
    expect(
      screenSignupRequest({ ipCount: 1, honeypot: "https://spam.example", tokenVerdict: "ok" }),
    ).toBe("drop")
  })

  it("drops any token verdict other than ok", () => {
    for (const tokenVerdict of ["missing", "invalid", "too_fast", "expired"] as const) {
      expect(screenSignupRequest({ ipCount: 1, honeypot: "", tokenVerdict })).toBe("drop")
    }
  })

  it("rate-limits past the IP cap before looking at bot signals", () => {
    expect(
      screenSignupRequest({ ipCount: SIGNUP_IP_LIMIT + 1, honeypot: "x", tokenVerdict: "invalid" }),
    ).toBe("rate_limited")
  })
})

describe("countSignupAttempt", () => {
  it("counts per IP and sets an hour window on the first hit", async () => {
    const { redis, ttls } = createFakeRedis()
    expect(await countSignupAttempt(redis, "1.2.3.4")).toBe(1)
    expect(await countSignupAttempt(redis, "1.2.3.4")).toBe(2)
    expect(await countSignupAttempt(redis, "5.6.7.8")).toBe(1)
    expect(ttls.get("newsletter:signup:ip:1.2.3.4")).toBe(3600)
  })
})

describe("reserveConfirmationSend", () => {
  const email = "listener@example.com"

  it("blocks a second send inside the 10-minute cooldown", async () => {
    const { redis } = createFakeRedis()
    expect(await reserveConfirmationSend(redis, email)).toBe("reserved")
    expect(await reserveConfirmationSend(redis, email)).toBe("cooldown")
  })

  it("allows a resend after the cooldown, up to the daily limit", async () => {
    const fake = createFakeRedis()
    for (let i = 0; i < SIGNUP_EMAIL_DAILY_LIMIT; i++) {
      expect(await reserveConfirmationSend(fake.redis, email)).toBe("reserved")
      fake.expireMatching(":cooldown:")
    }
    expect(await reserveConfirmationSend(fake.redis, email)).toBe("daily_cap")
  })

  it("does not store the email address in Redis keys", async () => {
    const { redis, values } = createFakeRedis()
    await reserveConfirmationSend(redis, email)
    for (const key of Array.from(values.keys())) expect(key).not.toContain(email)
  })

  it("gives the allowance back when the send fails", async () => {
    const fake = createFakeRedis()
    expect(await reserveConfirmationSend(fake.redis, email)).toBe("reserved")
    await releaseConfirmationSend(fake.redis, email)
    expect(await reserveConfirmationSend(fake.redis, email)).toBe("reserved")
    const dayCount = Array.from(fake.values.entries()).find(([key]) => key.includes(":day:"))?.[1]
    expect(dayCount).toBe(1)
  })
})

describe("renderConfirmPage", () => {
  it("renders a POST form and escapes the inputs", () => {
    const html = renderConfirmPage({ token: 'abc"><script>', email: "a&b@example.com" })
    expect(html).toContain('method="post"')
    expect(html).toContain('action="/api/newsletter/confirm"')
    expect(html).not.toContain("<script>")
    expect(html).toContain("a&amp;b@example.com")
    expect(html).not.toContain("http-equiv")
  })
})
