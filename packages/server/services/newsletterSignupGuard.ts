import crypto from "crypto"

export const SIGNUP_TOKEN_MIN_AGE_MS = 2_000
export const SIGNUP_TOKEN_MAX_AGE_MS = 30 * 60 * 1000
export const SIGNUP_IP_LIMIT = 5
export const SIGNUP_IP_WINDOW_SEC = 60 * 60
export const SIGNUP_EMAIL_COOLDOWN_SEC = 10 * 60
export const SIGNUP_EMAIL_DAILY_LIMIT = 3
export const SIGNUP_EMAIL_DAILY_WINDOW_SEC = 24 * 60 * 60

/** Subset of the node-redis client used by the signup caps. */
export interface SignupGuardRedis {
  incr(key: string): Promise<number>
  decr(key: string): Promise<number>
  expire(key: string, seconds: number): Promise<unknown>
  set(key: string, value: string, options: { NX: true; EX: number }): Promise<string | null>
  del(key: string): Promise<number>
}

export type SignupTokenVerdict = "ok" | "missing" | "invalid" | "too_fast" | "expired"

export type SignupScreenResult = "rate_limited" | "drop" | "continue"

export type ConfirmationSendReservation = "reserved" | "cooldown" | "daily_cap"

// ---------------------------------------------------------------------------
// Form token (stateless HMAC)
// ---------------------------------------------------------------------------

function signTokenPayload(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(`newsletter-signup:${payload}`).digest("hex")
}

export function issueSignupToken(now: number, secret: string): string {
  const payload = `${now}.${crypto.randomBytes(12).toString("hex")}`
  return `${payload}.${signTokenPayload(payload, secret)}`
}

export function readSignupToken(
  token: string | undefined,
  now: number,
  secret: string,
): SignupTokenVerdict {
  if (!token) return "missing"
  const parts = token.split(".")
  if (parts.length !== 3) return "invalid"
  const [issuedAtRaw, nonce, signature] = parts
  const issuedAt = Number(issuedAtRaw)
  if (!Number.isSafeInteger(issuedAt) || !nonce) return "invalid"

  const expected = signTokenPayload(`${issuedAtRaw}.${nonce}`, secret)
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return "invalid"

  const age = now - issuedAt
  if (age < SIGNUP_TOKEN_MIN_AGE_MS) return "too_fast"
  if (age > SIGNUP_TOKEN_MAX_AGE_MS) return "expired"
  return "ok"
}

// ---------------------------------------------------------------------------
// Request screening
// ---------------------------------------------------------------------------

export function screenSignupRequest(input: {
  ipCount: number
  honeypot: string | undefined
  tokenVerdict: SignupTokenVerdict
}): SignupScreenResult {
  if (input.ipCount > SIGNUP_IP_LIMIT) return "rate_limited"
  if (input.honeypot) return "drop"
  if (input.tokenVerdict !== "ok") return "drop"
  return "continue"
}

// ---------------------------------------------------------------------------
// Redis caps
// ---------------------------------------------------------------------------

function hashEmail(normalizedEmail: string): string {
  return crypto.createHash("sha256").update(normalizedEmail).digest("hex")
}

function ipKey(ip: string): string {
  return `newsletter:signup:ip:${ip}`
}

function cooldownKey(normalizedEmail: string): string {
  return `newsletter:signup:email:cooldown:${hashEmail(normalizedEmail)}`
}

function dailyKey(normalizedEmail: string): string {
  return `newsletter:signup:email:day:${hashEmail(normalizedEmail)}`
}

async function incrementWindow(
  redis: SignupGuardRedis,
  key: string,
  windowSec: number,
): Promise<number> {
  const count = await redis.incr(key)
  if (count === 1) await redis.expire(key, windowSec)
  return count
}

export function countSignupAttempt(redis: SignupGuardRedis, ip: string): Promise<number> {
  return incrementWindow(redis, ipKey(ip), SIGNUP_IP_WINDOW_SEC)
}

export async function reserveConfirmationSend(
  redis: SignupGuardRedis,
  normalizedEmail: string,
): Promise<ConfirmationSendReservation> {
  const cooldown = await redis.set(cooldownKey(normalizedEmail), "1", {
    NX: true,
    EX: SIGNUP_EMAIL_COOLDOWN_SEC,
  })
  if (cooldown === null) return "cooldown"

  const key = dailyKey(normalizedEmail)
  const count = await incrementWindow(redis, key, SIGNUP_EMAIL_DAILY_WINDOW_SEC)
  if (count > SIGNUP_EMAIL_DAILY_LIMIT) {
    await redis.decr(key)
    return "daily_cap"
  }
  return "reserved"
}

export async function releaseConfirmationSend(
  redis: SignupGuardRedis,
  normalizedEmail: string,
): Promise<void> {
  await redis.del(cooldownKey(normalizedEmail))
  const key = dailyKey(normalizedEmail)
  // DECR on an expired key would create a negative counter with no TTL.
  if ((await redis.decr(key)) <= 0) await redis.del(key)
}
