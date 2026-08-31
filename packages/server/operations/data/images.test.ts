import { describe, it, expect, vi, beforeEach } from "vitest"
import { AppContext } from "@repo/types"

const mockGenerateId = vi.hoisted(() => vi.fn())

vi.mock("../../lib/generateId", () => ({
  default: mockGenerateId,
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
  })

  it("hashRoomImageContent is stable for identical buffers", () => {
    const buf = Buffer.from("same-bytes")
    expect(hashRoomImageContent(buf)).toBe(hashRoomImageContent(Buffer.from("same-bytes")))
  })

  it("storeDedupedRoomImage returns cached id for identical processed content", async () => {
    const buffer = Buffer.from("processed-jpeg")

    const first = await storeDedupedRoomImage({
      roomId: "room-1",
      buffer,
      mimeType: "image/jpeg",
      context,
    })
    expect(first).toEqual({ success: true, imageId: "img-1", cached: false })

    const second = await storeDedupedRoomImage({
      roomId: "room-1",
      buffer: Buffer.from("processed-jpeg"),
      mimeType: "image/jpeg",
      context,
    })
    expect(second).toEqual({ success: true, imageId: "img-1", cached: true })
    expect(redis.hSet).toHaveBeenCalledTimes(1)
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

    expect(otherRoom).toEqual({ success: true, imageId: "img-2", cached: false })
  })

  it("deleteRoomImages removes content-hash index keys", async () => {
    const buffer = Buffer.from("jpeg")
    const hash = hashRoomImageContent(buffer)
    await storeImage({
      roomId: "room-1",
      imageId: "img-1",
      base64Data: buffer.toString("base64"),
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
