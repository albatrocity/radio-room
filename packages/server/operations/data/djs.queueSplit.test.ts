import { describe, it, expect, beforeEach } from "vitest"
import type { AppContext } from "@repo/types"
import { canonicalQueueTrackKey } from "@repo/types/Queue"
import { queueItemFactory } from "@repo/factories/queueItem"
import { MemoryRedisClient } from "../../test-utils/MemoryRedisClient"
import {
  addToQueue,
  buildQueueChangedData,
  clearQueueSplit,
  getNormalizedQueueSplit,
  getQueueSplit,
  queueSplitStorageKey,
  removeFromQueue,
  reanchorQueueSplitOnRemoval,
  setQueueSplit,
} from "./djs"

const ROOM_ID = "room-split-test"

function makeContext(client: MemoryRedisClient): AppContext {
  return {
    redis: {
      pubClient: client as unknown as AppContext["redis"]["pubClient"],
      subClient: client as unknown as AppContext["redis"]["subClient"],
    },
  } as AppContext
}

function itemWithId(id: string, addedAt: number) {
  const track = queueItemFactory.build().track
  track.id = id
  return queueItemFactory.build({
    track,
    mediaSource: { type: "spotify", trackId: id },
    metadataSource: { type: "spotify", trackId: id },
    addedAt,
  })
}

describe("queue split data layer", () => {
  let client: MemoryRedisClient
  let context: AppContext

  beforeEach(() => {
    client = new MemoryRedisClient()
    context = makeContext(client)
  })

  it("getNormalizedQueueSplit returns anchor when at index >= 1", async () => {
    const a = itemWithId("track-a", 1)
    const b = itemWithId("track-b", 2)
    const c = itemWithId("track-c", 3)
    await addToQueue({ roomId: ROOM_ID, item: a, context })
    await addToQueue({ roomId: ROOM_ID, item: b, context })
    await addToQueue({ roomId: ROOM_ID, item: c, context })

    const belowKey = canonicalQueueTrackKey(b)
    await setQueueSplit({ roomId: ROOM_ID, context, belowKey })

    await expect(getNormalizedQueueSplit({ roomId: ROOM_ID, context })).resolves.toBe(belowKey)
  })

  it("getNormalizedQueueSplit clears when anchor is at index 0", async () => {
    const a = itemWithId("track-a", 1)
    const b = itemWithId("track-b", 2)
    await addToQueue({ roomId: ROOM_ID, item: a, context })
    await addToQueue({ roomId: ROOM_ID, item: b, context })

    await setQueueSplit({ roomId: ROOM_ID, context, belowKey: canonicalQueueTrackKey(a) })

    await expect(getNormalizedQueueSplit({ roomId: ROOM_ID, context })).resolves.toBeNull()
    await expect(getQueueSplit({ roomId: ROOM_ID, context })).resolves.toBeNull()
  })

  it("getNormalizedQueueSplit clears when anchor is missing from queue", async () => {
    await client.set(queueSplitStorageKey(ROOM_ID), "spotify:ghost")

    await expect(getNormalizedQueueSplit({ roomId: ROOM_ID, context })).resolves.toBeNull()
    await expect(getQueueSplit({ roomId: ROOM_ID, context })).resolves.toBeNull()
  })

  it("reanchorQueueSplitOnRemoval points split at the next track below", async () => {
    const a = itemWithId("track-a", 1)
    const b = itemWithId("track-b", 2)
    const c = itemWithId("track-c", 3)
    await addToQueue({ roomId: ROOM_ID, item: a, context })
    await addToQueue({ roomId: ROOM_ID, item: b, context })
    await addToQueue({ roomId: ROOM_ID, item: c, context })

    const anchorKey = canonicalQueueTrackKey(b)
    await setQueueSplit({ roomId: ROOM_ID, context, belowKey: anchorKey })

    await removeFromQueue({ roomId: ROOM_ID, trackId: anchorKey, context })

    await expect(getQueueSplit({ roomId: ROOM_ID, context })).resolves.toBe(
      canonicalQueueTrackKey(c),
    )
  })

  it("reanchorQueueSplitOnRemoval clears split when anchor was the last track", async () => {
    const a = itemWithId("track-a", 1)
    const b = itemWithId("track-b", 2)
    await addToQueue({ roomId: ROOM_ID, item: a, context })
    await addToQueue({ roomId: ROOM_ID, item: b, context })

    const anchorKey = canonicalQueueTrackKey(b)
    await setQueueSplit({ roomId: ROOM_ID, context, belowKey: anchorKey })

    await removeFromQueue({ roomId: ROOM_ID, trackId: anchorKey, context })

    await expect(getQueueSplit({ roomId: ROOM_ID, context })).resolves.toBeNull()
  })

  it("reanchorQueueSplitOnRemoval is a no-op when removed track is not the anchor", async () => {
    const a = itemWithId("track-a", 1)
    const b = itemWithId("track-b", 2)
    await addToQueue({ roomId: ROOM_ID, item: a, context })
    await addToQueue({ roomId: ROOM_ID, item: b, context })

    const anchorKey = canonicalQueueTrackKey(b)
    await setQueueSplit({ roomId: ROOM_ID, context, belowKey: anchorKey })

    await reanchorQueueSplitOnRemoval({
      roomId: ROOM_ID,
      context,
      removedKey: canonicalQueueTrackKey(a),
    })

    await expect(getQueueSplit({ roomId: ROOM_ID, context })).resolves.toBe(anchorKey)
  })

  it("clearQueueSplit removes stored anchor", async () => {
    await setQueueSplit({ roomId: ROOM_ID, context, belowKey: "spotify:x" })
    await clearQueueSplit({ roomId: ROOM_ID, context })
    await expect(getQueueSplit({ roomId: ROOM_ID, context })).resolves.toBeNull()
  })

  it("buildQueueChangedData includes normalized splitKey for app-controlled rooms", async () => {
    const a = itemWithId("track-a", 1)
    const b = itemWithId("track-b", 2)
    await addToQueue({ roomId: ROOM_ID, item: a, context })
    await addToQueue({ roomId: ROOM_ID, item: b, context })
    await setQueueSplit({ roomId: ROOM_ID, context, belowKey: canonicalQueueTrackKey(b) })

    const payload = await buildQueueChangedData({
      roomId: ROOM_ID,
      context,
      appControlled: true,
    })

    expect(payload.splitKey).toBe(canonicalQueueTrackKey(b))
    expect(payload.queue.map((item) => canonicalQueueTrackKey(item))).toEqual([
      canonicalQueueTrackKey(a),
      canonicalQueueTrackKey(b),
    ])
  })

  it("buildQueueChangedData omits split for spotify-controlled rooms", async () => {
    await setQueueSplit({ roomId: ROOM_ID, context, belowKey: "spotify:x" })

    const payload = await buildQueueChangedData({
      roomId: ROOM_ID,
      context,
      appControlled: false,
    })

    expect(payload.splitKey).toBeNull()
    expect(payload.queue).toEqual([])
  })
})
