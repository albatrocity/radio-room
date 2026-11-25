import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// ---------------------------------------------------------------------------
// Mocks (must be set up before importing the module under test)
// ---------------------------------------------------------------------------

const send = vi.hoisted(() => vi.fn())
const getSignedUrl = vi.hoisted(() => vi.fn())

const dbState = vi.hoisted(() => ({
  insertedRows: [] as Array<Record<string, unknown>>,
  selectRows: [] as Array<Record<string, unknown>>,
  updateReturning: [] as Array<Record<string, unknown>>,
  lastInsertValues: null as Record<string, unknown> | null,
  lastSelectWhere: null as unknown,
  lastUpdateWhere: null as unknown,
}))

vi.mock("@aws-sdk/client-s3", () => ({
  HeadObjectCommand: class HeadObjectCommand {
    input: unknown
    constructor(input: unknown) {
      this.input = input
    }
  },
  PutObjectCommand: class PutObjectCommand {
    input: unknown
    constructor(input: unknown) {
      this.input = input
    }
  },
  GetObjectCommand: class GetObjectCommand {
    input: unknown
    constructor(input: unknown) {
      this.input = input
    }
  },
}))

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: (...args: unknown[]) => getSignedUrl(...args),
}))

vi.mock("../lib/s3Presign", () => ({
  getAssetS3Client: () => ({ send }),
}))

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ _op: "and", args }),
  eq: (a: unknown, b: unknown) => ({ _op: "eq", a, b }),
  gte: (a: unknown, b: unknown) => ({ _op: "gte", a, b }),
  lt: (a: unknown, b: unknown) => ({ _op: "lt", a, b }),
  desc: (a: unknown) => ({ _op: "desc", a }),
}))

vi.mock("@repo/db", () => {
  const voicemail = {
    id: { name: "id" },
    createdAt: { name: "createdAt" },
    s3Key: { name: "s3Key" },
    contentType: { name: "contentType" },
    byteSize: { name: "byteSize" },
    durationMs: { name: "durationMs" },
    label: { name: "label" },
    status: { name: "status" },
  }

  const insertBuilder = (_table: unknown) => ({
    values(row: Record<string, unknown>) {
      dbState.lastInsertValues = row
      dbState.insertedRows.push(row)
      return Promise.resolve(undefined)
    },
  })

  const updateBuilder = (_table: unknown) => ({
    set(_patch: Record<string, unknown>) {
      return {
        where(cond: unknown) {
          dbState.lastUpdateWhere = cond
          return {
            returning(_cols?: unknown) {
              return Promise.resolve(dbState.updateReturning)
            },
          }
        },
      }
    },
  })

  const selectBuilder = (_cols?: unknown) => ({
    from(_table: unknown) {
      const chain = {
        where(cond: unknown) {
          dbState.lastSelectWhere = cond
          return chain
        },
        orderBy(_order: unknown) {
          return chain
        },
        limit(_n: number) {
          return Promise.resolve(dbState.selectRows)
        },
        then(onFulfilled: (rows: unknown[]) => unknown) {
          return Promise.resolve(dbState.selectRows).then(onFulfilled)
        },
      }
      return chain
    },
  })

  return {
    db: {
      insert: (table: unknown) => insertBuilder(table),
      update: (table: unknown) => updateBuilder(table),
      select: (cols?: unknown) => selectBuilder(cols),
    },
    voicemail,
  }
})

// ---------------------------------------------------------------------------
// Imports (after mocks are registered)
// ---------------------------------------------------------------------------

import {
  completeVoicemail,
  createVoicemailPresign,
  hashClientIp,
  hideVoicemail,
  listVoicemails,
  normalizeContentType,
  normalizeLabel,
  VoicemailBadRequestError,
  VoicemailNotFoundError,
  VoicemailRateLimitedError,
  VOICEMAIL_COMPLETE_LIMIT_PER_DAY,
  VOICEMAIL_COMPLETE_WINDOW_SEC,
  VOICEMAIL_PRESIGN_LIMIT_PER_HOUR,
  VOICEMAIL_PRESIGN_WINDOW_SEC,
} from "./VoicemailService"
import {
  VOICEMAIL_LIST_MAX_SPAN_DAYS,
  VOICEMAIL_MAX_BYTES,
  VOICEMAIL_MAX_DURATION_MS,
  VOICEMAIL_RETENTION_DAYS,
} from "@repo/types"

// ---------------------------------------------------------------------------
// In-memory redis for the voicemail service
// ---------------------------------------------------------------------------

function createFakeRedis() {
  const values = new Map<string, string>()
  const ttls = new Map<string, number>()

  const client = {
    async get(key: string) {
      return values.has(key) ? (values.get(key) as string) : null
    },
    async setEx(key: string, ttl: number, value: string) {
      values.set(key, value)
      ttls.set(key, ttl)
      return "OK"
    },
    async del(key: string | string[]) {
      const keys = Array.isArray(key) ? key : [key]
      let removed = 0
      for (const k of keys) {
        ttls.delete(k)
        if (values.delete(k)) removed++
      }
      return removed
    },
    async incr(key: string) {
      const next = Number(values.get(key) ?? "0") + 1
      values.set(key, String(next))
      return next
    },
    async expire(key: string, ttl: number) {
      ttls.set(key, ttl)
      return 1
    },
    async ttl(key: string) {
      return ttls.get(key) ?? -2
    },
  }

  return { redis: { pubClient: client }, values, ttls }
}

// ---------------------------------------------------------------------------
// Common env + mock defaults
// ---------------------------------------------------------------------------

const ORIGINAL_ENV = { ...process.env }

function resetDbState() {
  dbState.insertedRows.length = 0
  dbState.selectRows = []
  dbState.updateReturning = []
  dbState.lastInsertValues = null
  dbState.lastSelectWhere = null
  dbState.lastUpdateWhere = null
}

beforeEach(() => {
  process.env.VOICEMAIL_IP_HMAC_SECRET = "test-ip-secret"
  process.env.ASSET_S3_BUCKET = "test-bucket"

  getSignedUrl.mockImplementation(async (_client, _command, _opts) => {
    return "https://s3.example/presigned"
  })
  // Default: HeadObject returns a match. Individual tests may override.
  send.mockImplementation(async () => ({
    ContentLength: 1024,
    ContentType: "audio/webm",
  }))
  resetDbState()
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("normalizeContentType", () => {
  it("strips codec parameters", () => {
    expect(normalizeContentType("audio/webm;codecs=opus")).toBe("audio/webm")
    expect(normalizeContentType("audio/mp4; codecs=\"mp4a.40.2\"")).toBe("audio/mp4")
    expect(normalizeContentType("  AUDIO/OGG  ")).toBe("audio/ogg")
  })
})

describe("normalizeLabel", () => {
  it("trims and strips control characters", () => {
    expect(normalizeLabel("  hello\u0007 world  ")).toBe("hello world")
  })

  it("truncates to 40 chars", () => {
    expect(normalizeLabel("x".repeat(80))?.length).toBe(40)
  })

  it("returns null for empty / whitespace-only", () => {
    expect(normalizeLabel("")).toBeNull()
    expect(normalizeLabel("   ")).toBeNull()
    expect(normalizeLabel(null)).toBeNull()
    expect(normalizeLabel(undefined)).toBeNull()
  })
})

describe("hashClientIp", () => {
  it("produces different outputs for different IPs and is 64 hex chars", () => {
    const a = hashClientIp("1.2.3.4")
    const b = hashClientIp("1.2.3.5")
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it("fails closed when the secret is unset", () => {
    delete process.env.VOICEMAIL_IP_HMAC_SECRET
    expect(() => hashClientIp("1.2.3.4")).toThrow(VoicemailBadRequestError)
  })
})

// ---------------------------------------------------------------------------
// Presign
// ---------------------------------------------------------------------------

describe("createVoicemailPresign", () => {
  const validInput = {
    ip: "1.2.3.4",
    contentType: "audio/webm;codecs=opus",
    contentLength: 1024,
    durationMs: 5_000,
    label: "Hi",
  }

  it("presigns and never returns a GET URL", async () => {
    const { redis, values, ttls } = createFakeRedis()
    const result = await createVoicemailPresign({ redis, ...validInput })

    expect(result).toEqual({
      uploadId: expect.any(String),
      url: "https://s3.example/presigned",
      contentType: "audio/webm",
      contentLength: 1024,
    })
    // Public response shape: exactly four keys, no GET URL.
    expect(Object.keys(result).sort()).toEqual([
      "contentLength",
      "contentType",
      "uploadId",
      "url",
    ])

    // Session is stored in Redis under the uploadId.
    const sessionKey = `voicemail:upload:${result.uploadId}`
    expect(values.get(sessionKey)).toBeTruthy()
    expect(ttls.get(sessionKey)).toBe(2 * 60 * 60)

    // Presign counter was set with a 1-hour TTL, keyed by HMAC (not raw IP).
    const ipHmac = hashClientIp(validInput.ip)
    const presignKey = `voicemail:rate:presign:${ipHmac}`
    expect(values.get(presignKey)).toBe("1")
    expect(ttls.get(presignKey)).toBe(VOICEMAIL_PRESIGN_WINDOW_SEC)
    expect(VOICEMAIL_PRESIGN_WINDOW_SEC).toBe(3600)

    for (const key of Array.from(values.keys())) {
      expect(key).not.toContain(validInput.ip)
    }
  })

  it("rejects an unsupported content type", async () => {
    const { redis } = createFakeRedis()
    await expect(
      createVoicemailPresign({ redis, ...validInput, contentType: "audio/mpeg" }),
    ).rejects.toBeInstanceOf(VoicemailBadRequestError)
  })

  it("rejects contentLength above the cap", async () => {
    const { redis } = createFakeRedis()
    await expect(
      createVoicemailPresign({
        redis,
        ...validInput,
        contentLength: VOICEMAIL_MAX_BYTES + 1,
      }),
    ).rejects.toBeInstanceOf(VoicemailBadRequestError)
  })

  it("rejects durationMs outside 1..VOICEMAIL_MAX_DURATION_MS", async () => {
    const { redis } = createFakeRedis()
    await expect(
      createVoicemailPresign({ redis, ...validInput, durationMs: 0 }),
    ).rejects.toBeInstanceOf(VoicemailBadRequestError)
    await expect(
      createVoicemailPresign({
        redis,
        ...validInput,
        durationMs: VOICEMAIL_MAX_DURATION_MS + 1,
      }),
    ).rejects.toBeInstanceOf(VoicemailBadRequestError)
  })

  it("is rejected once three completes are already counted", async () => {
    const { redis, values } = createFakeRedis()
    const ipHmac = hashClientIp(validInput.ip)
    values.set(
      `voicemail:rate:complete:${ipHmac}`,
      String(VOICEMAIL_COMPLETE_LIMIT_PER_DAY),
    )
    await expect(
      createVoicemailPresign({ redis, ...validInput }),
    ).rejects.toBeInstanceOf(VoicemailRateLimitedError)
  })

  it("rate-limits past the 10-per-hour presign window", async () => {
    const { redis } = createFakeRedis()
    for (let i = 0; i < VOICEMAIL_PRESIGN_LIMIT_PER_HOUR; i++) {
      await createVoicemailPresign({ redis, ...validInput })
    }
    await expect(
      createVoicemailPresign({ redis, ...validInput }),
    ).rejects.toBeInstanceOf(VoicemailRateLimitedError)
  })
})

// ---------------------------------------------------------------------------
// Complete
// ---------------------------------------------------------------------------

describe("completeVoicemail", () => {
  const presignInput = {
    ip: "9.9.9.9",
    contentType: "audio/webm",
    contentLength: 1024,
    durationMs: 5_000,
    label: "message one",
  }

  it("inserts a row only after HeadObject matches, then clears the session", async () => {
    const { redis, values, ttls } = createFakeRedis()

    const presign = await createVoicemailPresign({ redis, ...presignInput })
    send.mockResolvedValueOnce({ ContentLength: 1024, ContentType: "audio/webm" })

    const result = await completeVoicemail({
      redis,
      ip: presignInput.ip,
      uploadId: presign.uploadId,
    })
    expect(result).toEqual({ ok: true })

    // Row inserted with the id from the session.
    expect(dbState.insertedRows).toHaveLength(1)
    expect(dbState.insertedRows[0]).toMatchObject({
      id: presign.uploadId,
      s3Key: `voicemails/v1/${presign.uploadId}.webm`,
      contentType: "audio/webm",
      byteSize: 1024,
      durationMs: 5_000,
      label: "message one",
      status: "ready",
    })

    // Session key is removed after a successful complete.
    expect(values.has(`voicemail:upload:${presign.uploadId}`)).toBe(false)

    // Complete counter is set with a 24h TTL and keyed by HMAC.
    const ipHmac = hashClientIp(presignInput.ip)
    const completeKey = `voicemail:rate:complete:${ipHmac}`
    expect(values.get(completeKey)).toBe("1")
    expect(ttls.get(completeKey)).toBe(VOICEMAIL_COMPLETE_WINDOW_SEC)
    expect(VOICEMAIL_COMPLETE_WINDOW_SEC).toBe(86_400)

    for (const key of Array.from(values.keys())) {
      expect(key).not.toContain(presignInput.ip)
    }
  })

  it("does NOT insert when HeadObject returns a mismatched size", async () => {
    const { redis } = createFakeRedis()
    const presign = await createVoicemailPresign({ redis, ...presignInput })

    send.mockResolvedValueOnce({ ContentLength: 999, ContentType: "audio/webm" })
    await expect(
      completeVoicemail({ redis, ip: presignInput.ip, uploadId: presign.uploadId }),
    ).rejects.toBeInstanceOf(VoicemailBadRequestError)

    expect(dbState.insertedRows).toHaveLength(0)
  })

  it("does NOT insert when HeadObject returns a mismatched content type", async () => {
    const { redis } = createFakeRedis()
    const presign = await createVoicemailPresign({ redis, ...presignInput })

    send.mockResolvedValueOnce({ ContentLength: 1024, ContentType: "audio/mp4" })
    await expect(
      completeVoicemail({ redis, ip: presignInput.ip, uploadId: presign.uploadId }),
    ).rejects.toBeInstanceOf(VoicemailBadRequestError)

    expect(dbState.insertedRows).toHaveLength(0)
  })

  it("rejects when the S3 object is missing (NotFound)", async () => {
    const { redis } = createFakeRedis()
    const presign = await createVoicemailPresign({ redis, ...presignInput })

    send.mockImplementationOnce(async () => {
      const err = new Error("NotFound") as Error & {
        name: string
        $metadata: { httpStatusCode: number }
      }
      err.name = "NotFound"
      err.$metadata = { httpStatusCode: 404 }
      throw err
    })
    await expect(
      completeVoicemail({ redis, ip: presignInput.ip, uploadId: presign.uploadId }),
    ).rejects.toBeInstanceOf(VoicemailNotFoundError)

    expect(dbState.insertedRows).toHaveLength(0)
  })

  it("rejects a fourth complete within the 24h window", async () => {
    const { redis } = createFakeRedis()

    // Three successful completes.
    for (let i = 0; i < VOICEMAIL_COMPLETE_LIMIT_PER_DAY; i++) {
      const presign = await createVoicemailPresign({ redis, ...presignInput })
      send.mockResolvedValueOnce({
        ContentLength: 1024,
        ContentType: "audio/webm",
      })
      await completeVoicemail({
        redis,
        ip: presignInput.ip,
        uploadId: presign.uploadId,
      })
    }
    expect(dbState.insertedRows).toHaveLength(VOICEMAIL_COMPLETE_LIMIT_PER_DAY)

    // The fourth presign is rejected before upload even starts.
    await expect(
      createVoicemailPresign({ redis, ...presignInput }),
    ).rejects.toBeInstanceOf(VoicemailRateLimitedError)
  })

  it("rejects a complete that races past the cap even when presign was allowed", async () => {
    const { redis, values } = createFakeRedis()

    const presign = await createVoicemailPresign({ redis, ...presignInput })
    // Simulate a concurrent complete having already filled the counter.
    const ipHmac = hashClientIp(presignInput.ip)
    values.set(
      `voicemail:rate:complete:${ipHmac}`,
      String(VOICEMAIL_COMPLETE_LIMIT_PER_DAY),
    )

    await expect(
      completeVoicemail({ redis, ip: presignInput.ip, uploadId: presign.uploadId }),
    ).rejects.toBeInstanceOf(VoicemailRateLimitedError)

    expect(dbState.insertedRows).toHaveLength(0)
  })

  it("fails if the session has expired", async () => {
    const { redis } = createFakeRedis()
    await expect(
      completeVoicemail({ redis, ip: "1.2.3.4", uploadId: "missing-id" }),
    ).rejects.toBeInstanceOf(VoicemailNotFoundError)
  })
})

// ---------------------------------------------------------------------------
// listVoicemails / hideVoicemail
// ---------------------------------------------------------------------------

describe("listVoicemails", () => {
  it("rejects an inverted range", async () => {
    const now = new Date()
    const earlier = new Date(now.getTime() - 60_000)
    await expect(
      listVoicemails({ from: now.toISOString(), to: earlier.toISOString() }),
    ).rejects.toBeInstanceOf(VoicemailBadRequestError)
  })

  it("rejects a span over 45 days", async () => {
    const to = new Date()
    const from = new Date(to.getTime() - (VOICEMAIL_LIST_MAX_SPAN_DAYS + 1) * 24 * 60 * 60 * 1000)
    await expect(
      listVoicemails({ from: from.toISOString(), to: to.toISOString() }),
    ).rejects.toBeInstanceOf(VoicemailBadRequestError)
  })

  it("rejects a from older than the 120-day retention window", async () => {
    const to = new Date()
    const from = new Date(
      to.getTime() - (VOICEMAIL_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000,
    )
    await expect(
      listVoicemails({ from: from.toISOString(), to: to.toISOString() }),
    ).rejects.toBeInstanceOf(VoicemailBadRequestError)
  })

  it("returns items with presigned GET URLs and flags truncation when over cap", async () => {
    const createdAt = new Date()
    // 201 synthetic rows to force truncation.
    dbState.selectRows = Array.from({ length: 201 }, (_, i) => ({
      id: `vm-${i}`,
      createdAt,
      s3Key: `voicemails/v1/vm-${i}.webm`,
      durationMs: 1000 + i,
      label: null,
    }))

    const to = new Date()
    const from = new Date(to.getTime() - 24 * 60 * 60 * 1000)
    const result = await listVoicemails({
      from: from.toISOString(),
      to: to.toISOString(),
    })

    expect(result.truncated).toBe(true)
    expect(result.items).toHaveLength(200)
    for (const item of result.items) {
      expect(item.url).toBe("https://s3.example/presigned")
    }
  })
})

describe("hideVoicemail", () => {
  it("throws VoicemailNotFoundError when no row is updated", async () => {
    dbState.updateReturning = []
    await expect(hideVoicemail("missing-id")).rejects.toBeInstanceOf(
      VoicemailNotFoundError,
    )
  })

  it("resolves when the row is updated", async () => {
    dbState.updateReturning = [{ id: "vm-1" }]
    await expect(hideVoicemail("vm-1")).resolves.toBeUndefined()
  })
})
