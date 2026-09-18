import { beforeEach, describe, expect, it, vi } from "vitest"
import type { AppContext } from "@repo/types"

const send = vi.hoisted(() => vi.fn())
const getAssetBucket = vi.hoisted(() => vi.fn(() => "test-bucket"))
const getAssetCdnBaseUrl = vi.hoisted(() => vi.fn(() => "https://cdn.example"))

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
}))

vi.mock("../lib/s3Presign", () => ({
  getAssetS3Client: () => ({ send }),
}))

vi.mock("../lib/assetEnv", () => ({
  getAssetBucket,
  getAssetCdnBaseUrl,
}))

import {
  ensureCoverObject,
  ensurePreviewObject,
  getCoverPointer,
  getPreviewPointer,
  headPreviewByFingerprint,
  setCoverPointer,
} from "./MediaObjectCache"
import { coverPointerKey, previewObjectKey, previewPointerKey } from "./mediaFingerprint"

describe("MediaObjectCache", () => {
  let cache: Map<string, string>
  let context: AppContext

  beforeEach(() => {
    vi.clearAllMocks()
    cache = new Map()
    context = {
      cache: {
        get: vi.fn(async (key: string) => cache.get(key) ?? null),
        set: vi.fn(async (key: string, value: string) => {
          cache.set(key, value)
        }),
        delete: vi.fn(async (key: string) => {
          cache.delete(key)
        }),
        deleteByPrefix: vi.fn(async (prefix: string) => {
          for (const key of [...cache.keys()]) {
            if (key.startsWith(prefix)) cache.delete(key)
          }
        }),
      },
    } as unknown as AppContext
    send.mockImplementation(async (cmd: { constructor: { name: string } }) => {
      if (cmd.constructor.name === "HeadObjectCommand") {
        const err = new Error("NotFound") as Error & { name: string; $metadata: { httpStatusCode: number } }
        err.name = "NotFound"
        err.$metadata = { httpStatusCode: 404 }
        throw err
      }
      return {}
    })
  })

  it("returns cover pointer hit without S3", async () => {
    await setCoverPointer({
      context,
      libraryId: "lib-1",
      identityHash: "idhash",
      variant: "sm",
      pointer: { url: "https://cdn.example/media/covers/v1/abc/sm.jpg" },
    })
    const hit = await getCoverPointer({
      context,
      libraryId: "lib-1",
      identityHash: "idhash",
      variant: "sm",
    })
    expect(hit).toEqual({ url: "https://cdn.example/media/covers/v1/abc/sm.jpg" })
    expect(send).not.toHaveBeenCalled()
    expect(cache.has(coverPointerKey("lib-1", "idhash", "sm"))).toBe(true)
  })

  it("ensureCoverObject Puts on miss then sets pointer", async () => {
    const result = await ensureCoverObject({
      context,
      libraryId: "lib-1",
      identityHash: "idhash",
      variant: "sm",
      base64Data: Buffer.from("jpeg-bytes").toString("base64"),
      mimeType: "image/jpeg",
    })
    expect(result.uploaded).toBe(true)
    expect(result.url).toMatch(/^https:\/\/cdn\.example\/media\/covers\/v1\/[0-9a-f]{64}\/sm\.jpg$/)
    expect(send).toHaveBeenCalled()
    const pointer = await getCoverPointer({
      context,
      libraryId: "lib-1",
      identityHash: "idhash",
      variant: "sm",
    })
    expect(pointer).toEqual({ url: result.url })
  })

  it("treats HeadObject 403 as a miss so Put can proceed", async () => {
    send.mockImplementation(async (cmd: { constructor: { name: string } }) => {
      if (cmd.constructor.name === "HeadObjectCommand") {
        const err = new Error("Forbidden") as Error & {
          name: string
          $metadata: { httpStatusCode: number }
        }
        err.name = "AccessDenied"
        err.$metadata = { httpStatusCode: 403 }
        throw err
      }
      return {}
    })
    const result = await ensureCoverObject({
      context,
      libraryId: "lib-1",
      identityHash: "idhash",
      variant: "sm",
      base64Data: Buffer.from("jpeg-bytes").toString("base64"),
    })
    expect(result.uploaded).toBe(true)
    expect(result.url).toContain("media/covers/")
  })

  it("headPreviewByFingerprint sets pointer when S3 object exists", async () => {
    send.mockImplementation(async (cmd: { constructor: { name: string }; input?: { Key?: string } }) => {
      if (cmd.constructor.name === "HeadObjectCommand") {
        return {}
      }
      return {}
    })
    const fp = "a".repeat(64)
    const pointer = await headPreviewByFingerprint({ context, fingerprintHash: fp })
    expect(pointer?.url).toBe(`https://cdn.example/${previewObjectKey(fp)}`)
    expect(cache.get(previewPointerKey(fp))).toContain(pointer!.url)
  })

  it("ensurePreviewObject skips Put when Head hits", async () => {
    send.mockImplementation(async (cmd: { constructor: { name: string } }) => {
      if (cmd.constructor.name === "HeadObjectCommand") return {}
      throw new Error(`unexpected ${cmd.constructor.name}`)
    })
    const fp = "b".repeat(64)
    const result = await ensurePreviewObject({
      context,
      fingerprintHash: fp,
      base64Data: "YWJj",
      mimeType: "audio/mpeg",
      durationMs: 15000,
    })
    expect(result.uploaded).toBe(false)
    expect(result.url).toBe(`https://cdn.example/${previewObjectKey(fp)}`)
    const cached = await getPreviewPointer({ context, fingerprintHash: fp })
    expect(cached?.url).toBe(result.url)
  })
})
