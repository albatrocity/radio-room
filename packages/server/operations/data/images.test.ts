import { describe, it, expect, vi, beforeEach } from "vitest"
import { AppContext } from "@repo/types"

const mockGenerateId = vi.hoisted(() => vi.fn())
const ensureRoomImageObject = vi.hoisted(() =>
  vi.fn(async ({ buffer }: { buffer: Buffer }) => ({
    url: `https://cdn.example/media/rooms/room-1/images/v1/${buffer.toString("hex").slice(0, 8)}.jpg`,
    contentHash: "hash",
    uploaded: true,
  })),
)

vi.mock("../../lib/generateId", () => ({
  default: mockGenerateId,
}))

vi.mock("../../services/MediaObjectCache", () => ({
  ensureRoomImageObject,
}))

import {
  deleteRoomImages,
  getImage,
  hashRoomImageContent,
  storeDedupedRoomImage,
  storeImage,
} from "./images"

function createRedisMock() {
  const strings = new Map<string, string>()
  const sets = new Map<string, Set<string>>()
  const hashes = new Map<string, Record<string, string>>()

  return {
    get: vi.fn(async (key: string) => strings.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      strings.set(key, value)
    }),
    hSet: vi.fn(async (key: string, fields: Record<string, string>) => {
      hashes.set(key, { ...(hashes.get(key) ?? {}), ...fields })
    }),
    hGet: vi.fn(async (key: string, field: string) => hashes.get(key)?.[field] ?? undefined),
    hGetAll: vi.fn(async (key: string) => hashes.get(key) ?? {}),
    sAdd: vi.fn(async (key: string, member: string) => {
      const set = sets.get(key) ?? new Set<string>()
      set.add(member)
      sets.set(key, set)
    }),
    sMembers: vi.fn(async (key: string) => [...(sets.get(key) ?? [])]),
    unlink: vi.fn(async (keys: string | string[]) => {
      const list = Array.isArray(keys) ? keys : [keys]
      for (const key of list) {
        strings.delete(key)
        sets.delete(key)
        hashes.delete(key)
      }
    }),
  }
}

describe("room image storage", () => {
  let redis: ReturnType<typeof createRedisMock>
  let context: AppContext

  beforeEach(() => {
    vi.clearAllMocks()
    redis = createRedisMock()
    context = { redis: { pubClient: redis as any, subClient: redis as any } } as AppContext
    mockGenerateId.mockReturnValueOnce("img-1").mockReturnValueOnce("img-2")
    ensureRoomImageObject.mockImplementation(async ({ buffer }: { buffer: Buffer }) => ({
      url: `https://cdn.example/img-${buffer.length}.jpg`,
      contentHash: hashRoomImageContent(buffer),
      uploaded: true,
    }))
  })

  it("hashRoomImageContent is stable for identical buffers", () => {
    const buf = Buffer.from("same-bytes")
    expect(hashRoomImageContent(buf)).toBe(hashRoomImageContent(Buffer.from("same-bytes")))
  })

  it("storeDedupedRoomImage uploads to S3 and returns cached id for identical content", async () => {
    const buffer = Buffer.from("processed-jpeg")

    const first = await storeDedupedRoomImage({
      roomId: "room-1",
      buffer,
      mimeType: "image/jpeg",
      context,
    })
    expect(first.success).toBe(true)
    if (first.success) {
      expect(first).toMatchObject({
        imageId: "img-1",
        cached: false,
        url: "https://cdn.example/img-14.jpg",
      })
    }
    expect(ensureRoomImageObject).toHaveBeenCalledTimes(1)

    const second = await storeDedupedRoomImage({
      roomId: "room-1",
      buffer: Buffer.from("processed-jpeg"),
      mimeType: "image/jpeg",
      context,
    })
    expect(second).toMatchObject({
      success: true,
      imageId: "img-1",
      cached: true,
      url: "https://cdn.example/img-14.jpg",
    })
    expect(ensureRoomImageObject).toHaveBeenCalledTimes(1)
    expect(redis.hSet).toHaveBeenCalledTimes(1)
    const stored = await getImage({ roomId: "room-1", imageId: "img-1", context })
    expect(stored?.url).toBe("https://cdn.example/img-14.jpg")
    expect(stored?.data).toBeUndefined()
  })

  it("storeDedupedRoomImage scopes dedup by room", async () => {
    const buffer = Buffer.from("shared")

    await storeDedupedRoomImage({ roomId: "room-a", buffer, mimeType: "image/jpeg", context })
    const otherRoom = await storeDedupedRoomImage({
      roomId: "room-b",
      buffer,
      mimeType: "image/jpeg",
      context,
    })

    expect(otherRoom).toMatchObject({ success: true, imageId: "img-2", cached: false })
  })

  it("deleteRoomImages removes content-hash index keys", async () => {
    const buffer = Buffer.from("jpeg")
    const hash = hashRoomImageContent(buffer)
    await storeImage({
      roomId: "room-1",
      imageId: "img-1",
      url: "https://cdn.example/x.jpg",
      mimeType: "image/jpeg",
      contentHash: hash,
      context,
    })
    await redis.set(`room:room-1:image-content:${hash}`, "img-1")
    await redis.sAdd("room:room-1:image-ids", "img-1")

    const deleted = await deleteRoomImages({ roomId: "room-1", context })
    expect(deleted).toEqual({ success: true, deleted: 1 })

    const image = await getImage({ roomId: "room-1", imageId: "img-1", context })
    expect(image).toBeNull()
    expect(await redis.get(`room:room-1:image-content:${hash}`)).toBeNull()
  })
})
