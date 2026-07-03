import { QueueItem, canonicalQueueTrackKey } from "@repo/types/Queue"
import { AppContext } from "@repo/types"

/** Legacy unordered queue membership (SET). Replaced by {@link queueOrderKey} ZSET. */
export function legacyQueueSetKey(roomId: string) {
  return `room:${roomId}:queue`
}

/** Ordered queue: member = canonical track key, score = ordering (FIFO via timestamps). */
export function queueOrderKey(roomId: string) {
  return `room:${roomId}:queue_order`
}

export function queuedTrackBlobKey(roomId: string, trackKey: string) {
  return `room:${roomId}:queued_track:${trackKey}`
}

export function dispatchedTrackKey(roomId: string) {
  return `room:${roomId}:dispatched_track`
}

/** Canonical key of the first track below the queue split divider (reserved lower section). */
export function queueSplitStorageKey(roomId: string) {
  return `room:${roomId}:queue_split`
}

const DISPATCHED_TTL_SEC = 60

/** Atomic pop lowest-score member from ZSET (same semantics as ZPOPMIN). */
const ZPOPMIN_LUA = `
local m = redis.call('ZRANGE', KEYS[1], 0, 0)
if not m[1] then
  return nil
end
redis.call('ZREM', KEYS[1], m[1])
return m[1]
`

/**
 * Migrate legacy SET-based queue to ZSET when the ordered key is missing or empty.
 * Prefers existing ZSET data; removes leftover legacy SET after migration or when ZSET wins.
 */
async function ensureQueueMigrated({
  roomId,
  context,
}: {
  roomId: string
  context: AppContext
}): Promise<void> {
  const client = context.redis.pubClient
  const orderKey = queueOrderKey(roomId)
  const legacyKey = legacyQueueSetKey(roomId)

  let zCard = 0
  try {
    zCard = await client.zCard(orderKey)
  } catch {
    zCard = 0
  }

  if (zCard > 0) {
    try {
      const legacyType = await client.type(legacyKey)
      if (legacyType === "set") {
        await client.unlink(legacyKey)
      }
    } catch {
      // ignore
    }
    return
  }

  let legacyMembers: string[] = []
  try {
    legacyMembers = await client.sMembers(legacyKey)
  } catch {
    legacyMembers = []
  }

  if (!legacyMembers.length) {
    return
  }

  type Loaded = { trackKey: string; addedAt: number }
  const loaded: Loaded[] = []

  for (const trackKey of legacyMembers) {
    try {
      const raw = await client.get(queuedTrackBlobKey(roomId, trackKey))
      if (!raw) {
        await client.sRem(legacyKey, trackKey)
        continue
      }
      const item = JSON.parse(raw) as QueueItem
      loaded.push({
        trackKey,
        addedAt: typeof item.addedAt === "number" ? item.addedAt : Date.now(),
      })
    } catch {
      await client.sRem(legacyKey, trackKey)
    }
  }

  loaded.sort((a, b) => a.addedAt - b.addedAt)

  if (!loaded.length) {
    await client.unlink(legacyKey)
    return
  }

  const args: { score: number; value: string }[] = loaded.map((row, index) => ({
    score: row.addedAt + index * 1e-9,
    value: row.trackKey,
  }))

  await client.zAdd(orderKey, args)
  await client.unlink(legacyKey)
}

export async function setDispatchedTrack({
  roomId,
  item,
  context,
}: {
  roomId: string
  item: QueueItem
  context: AppContext
}) {
  try {
    await context.redis.pubClient.set(dispatchedTrackKey(roomId), JSON.stringify(item), {
      EX: DISPATCHED_TTL_SEC,
    })
  } catch (e) {
    console.error("[setDispatchedTrack]", roomId, e)
  }
}

export async function getDispatchedTrack({
  roomId,
  context,
}: {
  roomId: string
  context: AppContext
}): Promise<QueueItem | null> {
  try {
    const raw = await context.redis.pubClient.get(dispatchedTrackKey(roomId))
    if (!raw) return null
    return JSON.parse(raw) as QueueItem
  } catch (e) {
    console.error("[getDispatchedTrack]", roomId, e)
    return null
  }
}

export async function clearDispatchedTrack({
  roomId,
  context,
}: {
  roomId: string
  context: AppContext
}) {
  try {
    await context.redis.pubClient.unlink(dispatchedTrackKey(roomId))
  } catch (e) {
    console.error("[clearDispatchedTrack]", roomId, e)
  }
}

export async function getQueueSplit({
  roomId,
  context,
}: {
  roomId: string
  context: AppContext
}): Promise<string | null> {
  try {
    const raw = await context.redis.pubClient.get(queueSplitStorageKey(roomId))
    if (!raw) return null
    return raw
  } catch (e) {
    console.error("[getQueueSplit]", roomId, e)
    return null
  }
}

export async function setQueueSplit({
  roomId,
  context,
  belowKey,
}: {
  roomId: string
  context: AppContext
  belowKey: string
}) {
  try {
    await context.redis.pubClient.set(queueSplitStorageKey(roomId), belowKey)
  } catch (e) {
    console.error("[setQueueSplit]", roomId, belowKey, e)
  }
}

export async function clearQueueSplit({
  roomId,
  context,
}: {
  roomId: string
  context: AppContext
}) {
  try {
    await context.redis.pubClient.unlink(queueSplitStorageKey(roomId))
  } catch (e) {
    console.error("[clearQueueSplit]", roomId, e)
  }
}

/**
 * Return the split anchor when it still points at a track with at least one track above it.
 * Clears stale split state when the anchor is missing or has reached queue head (index 0).
 */
export async function getNormalizedQueueSplit({
  roomId,
  context,
}: {
  roomId: string
  context: AppContext
}): Promise<string | null> {
  const belowKey = await getQueueSplit({ roomId, context })
  if (!belowKey) return null

  const queue = await getQueue({ roomId, context })
  const index = queue.findIndex((item) => canonicalQueueTrackKey(item) === belowKey)

  if (index < 1) {
    await clearQueueSplit({ roomId, context })
    return null
  }

  return belowKey
}

/**
 * When the split anchor track is removed, re-point the split to the next track below
 * (or clear if the anchor was the last track). Must run before ZREM on queue_order.
 */
export async function reanchorQueueSplitOnRemoval({
  roomId,
  context,
  removedKey,
}: {
  roomId: string
  context: AppContext
  removedKey: string
}) {
  try {
    await ensureQueueMigrated({ roomId, context })
    const splitKey = await getQueueSplit({ roomId, context })
    if (!splitKey || splitKey !== removedKey) {
      return
    }

    const client = context.redis.pubClient
    const orderKey = queueOrderKey(roomId)
    const rank = await client.zRank(orderKey, removedKey)
    if (rank == null) {
      await clearQueueSplit({ roomId, context })
      return
    }

    const successors = await client.zRange(orderKey, rank + 1, rank + 1)
    const successor = successors[0]
    if (successor) {
      await setQueueSplit({ roomId, context, belowKey: successor })
    } else {
      await clearQueueSplit({ roomId, context })
    }
  } catch (e) {
    console.error("[reanchorQueueSplitOnRemoval]", roomId, removedKey, e)
  }
}

export async function addDj({
  roomId,
  userId,
  context,
}: {
  roomId: string
  userId: string
  context: AppContext
}) {
  try {
    return context.redis.pubClient.sAdd(`room:${roomId}:djs`, userId)
  } catch (e) {
    console.log("ERROR FROM data/djs/addDj", roomId, userId)
    console.error(e)
    return null
  }
}
export async function removeDj({
  roomId,
  userId,
  context,
}: {
  roomId: string
  userId: string
  context: AppContext
}) {
  try {
    if (userId) {
      return context.redis.pubClient.sRem(`room:${roomId}:djs`, userId)
    }
    return null
  } catch (e) {
    console.log("ERROR FROM data/djs/removeDj", roomId, userId)
    console.error(e)
    return null
  }
}
export async function getDjs({ roomId, context }: { roomId: string; context: AppContext }) {
  try {
    return context.redis.pubClient.sMembers(`room:${roomId}:djs`)
  } catch (e) {
    console.log("ERROR FROM data/djs/getDjs", roomId)
    console.error(e)
    return []
  }
}
export async function isDj({
  roomId,
  userId,
  context,
}: {
  roomId: string
  userId: string
  context: AppContext
}) {
  try {
    return context.redis.pubClient.sIsMember(`room:${roomId}:djs`, userId)
  } catch (e) {
    console.log("ERROR FROM data/djs/getDjs", roomId)
    console.error(e)
    return false
  }
}

export async function addToQueue({
  roomId,
  item,
  context,
}: {
  roomId: string
  item: QueueItem
  context: AppContext
}) {
  try {
    await ensureQueueMigrated({ roomId, context })
    const value = JSON.stringify(item)
    const trackKey = canonicalQueueTrackKey(item)
    const score = typeof item.addedAt === "number" ? item.addedAt : Date.now()
    await context.redis.pubClient.zAdd(queueOrderKey(roomId), {
      score,
      value: trackKey,
    })
    await context.redis.pubClient.set(queuedTrackBlobKey(roomId, trackKey), value)
  } catch (e) {
    console.log("ERROR FROM data/djs/addToQueue", roomId, item)
    console.error(e)
    return null
  }
}

export async function removeFromQueue({
  roomId,
  trackId,
  context,
}: {
  roomId: string
  trackId: QueueItem["track"]["id"]
  context: AppContext
}) {
  await ensureQueueMigrated({ roomId, context })
  await reanchorQueueSplitOnRemoval({ roomId, context, removedKey: trackId })
  await context.redis.pubClient.zRem(queueOrderKey(roomId), trackId)
  await context.redis.pubClient.unlink(`room:${roomId}:queued_track:${trackId}`)
  return null
}

export async function getQueue({ roomId, context }: { roomId: string; context: AppContext }) {
  try {
    await ensureQueueMigrated({ roomId, context })

    const trackIds = await context.redis.pubClient.zRange(queueOrderKey(roomId), 0, -1)

    const queueItems: QueueItem[] | null[] = await Promise.all(
      trackIds.map(async (trackId) => {
        try {
          const value = await context.redis.pubClient.get(`room:${roomId}:queued_track:${trackId}`)
          if (!value) {
            await context.redis.pubClient.zRem(queueOrderKey(roomId), trackId)
            return null
          }
          return JSON.parse(value) as QueueItem
        } catch (e) {
          console.error(`Error fetching queued track ${trackId}:`, e)
          return null
        }
      }),
    )

    return queueItems.filter((item): item is QueueItem => item !== null)
  } catch (e) {
    console.log("ERROR FROM data/djs/getQueue", roomId)
    console.error(e)
    return []
  }
}

/**
 * Redis queue plus in-flight dispatched track (app-controlled), with `locked: true` on the head row.
 * Use for INIT / QUEUE_CHANGED wire payloads only — never for reorder validation or queue mutations.
 */
export async function getQueueWithDispatched({
  roomId,
  context,
}: {
  roomId: string
  context: AppContext
}): Promise<QueueItem[]> {
  const [dispatched, queue] = await Promise.all([
    getDispatchedTrack({ roomId, context }),
    getQueue({ roomId, context }),
  ])
  if (dispatched) {
    return [{ ...dispatched, locked: true }, ...queue]
  }
  return queue
}

/** Wire payload for INIT / QUEUE_CHANGED — queue snapshot plus normalized split anchor. */
export async function buildQueueChangedData({
  roomId,
  context,
  appControlled,
}: {
  roomId: string
  context: AppContext
  appControlled: boolean
}): Promise<{ roomId: string; queue: QueueItem[]; splitKey: string | null }> {
  const splitKey = appControlled
    ? await getNormalizedQueueSplit({ roomId, context })
    : null
  const queue = appControlled
    ? await getQueueWithDispatched({ roomId, context })
    : await getQueue({ roomId, context })
  return { roomId, queue, splitKey }
}

/**
 * Read the next track (FIFO head) without removing it from the ordered queue.
 */
export async function peekNextFromQueue({
  roomId,
  context,
}: {
  roomId: string
  context: AppContext
}): Promise<QueueItem | null> {
  try {
    await ensureQueueMigrated({ roomId, context })
    const client = context.redis.pubClient
    const orderKey = queueOrderKey(roomId)
    const members = await client.zRange(orderKey, 0, 0)
    const rawMember = members[0]
    if (rawMember == null || rawMember === "") {
      return null
    }
    const rawJson = await client.get(queuedTrackBlobKey(roomId, rawMember))
    if (!rawJson) {
      return null
    }
    return JSON.parse(rawJson) as QueueItem
  } catch (e) {
    console.error("ERROR FROM data/djs/peekNextFromQueue", roomId, e)
    return null
  }
}

/**
 * Atomically remove and return the next track (lowest score) from the ordered queue.
 */
export async function popNextFromQueue({
  roomId,
  context,
}: {
  roomId: string
  context: AppContext
}): Promise<QueueItem | null> {
  try {
    await ensureQueueMigrated({ roomId, context })
    const client = context.redis.pubClient
    const orderKey = queueOrderKey(roomId)
    const rawMember = (await client.eval(ZPOPMIN_LUA, {
      keys: [orderKey],
    })) as string | null

    if (rawMember == null || rawMember === "") {
      return null
    }

    const blobKey = queuedTrackBlobKey(roomId, rawMember)
    const rawJson = await client.get(blobKey)
    await client.unlink(blobKey)

    if (!rawJson) {
      return null
    }
    return JSON.parse(rawJson) as QueueItem
  } catch (e) {
    console.error("ERROR FROM data/djs/popNextFromQueue", roomId, e)
    return null
  }
}

export async function setQueue({
  roomId,
  items,
  context,
}: {
  roomId: string
  items: QueueItem[]
  context: AppContext
}) {
  try {
    await ensureQueueMigrated({ roomId, context })

    const orderKey = queueOrderKey(roomId)
    const currentMembers = await context.redis.pubClient.zRange(orderKey, 0, -1)

    const desiredKeys = items.map((item) => canonicalQueueTrackKey(item))

    const deletes = Promise.all(
      currentMembers.map(async (trackKey) => {
        if (desiredKeys.includes(trackKey)) {
          return null
        }
        await context.redis.pubClient.zRem(orderKey, trackKey)
        return context.redis.pubClient.unlink(queuedTrackBlobKey(roomId, trackKey))
      }),
    )

    await deletes

    const base = Date.now()
    for (let index = 0; index < items.length; index++) {
      const item = items[index]!
      const trackKey = canonicalQueueTrackKey(item)
      const score = base + index
      await context.redis.pubClient.zAdd(orderKey, { score, value: trackKey })
      await context.redis.pubClient.set(queuedTrackBlobKey(roomId, trackKey), JSON.stringify(item))
    }
    return await getQueue({ roomId, context })
  } catch (e) {
    console.log("ERROR FROM data/djs/setQueue", roomId, items)
    console.error(e)
    return []
  }
}

export async function clearQueue({ roomId, context }: { roomId: string; context: AppContext }) {
  try {
    await ensureQueueMigrated({ roomId, context })
    const orderKey = queueOrderKey(roomId)
    const members = await context.redis.pubClient.zRange(orderKey, 0, -1)
    await Promise.all(
      members.map((m) => context.redis.pubClient.unlink(queuedTrackBlobKey(roomId, m))),
    )
    await context.redis.pubClient.unlink(orderKey)
    await context.redis.pubClient.unlink(legacyQueueSetKey(roomId))
    await clearQueueSplit({ roomId, context })
    return []
  } catch (e) {
    console.log("ERROR FROM data/djs/clearQueue", roomId)
    console.error(e)
    return []
  }
}
