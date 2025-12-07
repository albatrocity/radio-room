import { QueueItem } from "@repo/types/Queue"
import { deleteMembersFromSet, getMembersFromSet } from "./utils"
import { AppContext } from "@repo/types"

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
    const value = JSON.stringify(item)
    // Use mediaSource for Redis key (always present)
    const trackKey = `${item.mediaSource.type}:${item.mediaSource.trackId}`
    await context.redis.pubClient.sAdd(`room:${roomId}:queue`, trackKey)
    await context.redis.pubClient.set(`room:${roomId}:queued_track:${trackKey}`, value)
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
  await context.redis.pubClient.sRem(`room:${roomId}:queue`, trackId)
  await context.redis.pubClient.unlink(`room:${roomId}:queued_track:${trackId}`)
  return null
}

export async function getQueue({ roomId, context }: { roomId: string; context: AppContext }) {
  try {
    // Get track IDs from the set
    const trackIds = await context.redis.pubClient.sMembers(`room:${roomId}:queue`)

    // Fetch each queued track
    const queueItems = await Promise.all(
      trackIds.map(async (trackId) => {
        try {
          const value = await context.redis.pubClient.get(`room:${roomId}:queued_track:${trackId}`)
          if (!value) {
            // Clean up orphaned set member
            await context.redis.pubClient.sRem(`room:${roomId}:queue`, trackId)
            return null
          }
          return JSON.parse(value) as QueueItem
        } catch (e) {
          console.error(`Error fetching queued track ${trackId}:`, e)
          return null
        }
      }),
    )

    // Filter out nulls
    return queueItems.filter((item): item is QueueItem => item !== null)
  } catch (e) {
    console.log("ERROR FROM data/djs/getQueue", roomId)
    console.error(e)
    return []
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
    const currentQueue = await context.redis.pubClient.sMembers(`room:${roomId}:queue`)

    // Deletes tracks from Redis that are not in the Spotify queue
    const deletes = Promise.all(
      currentQueue.map(async (id) => {
        const isInQueue = items.some((item) => item.track.id === id)
        if (isInQueue) {
          return null
        }
        await context.redis.pubClient.sRem(`room:${roomId}:queue`, id)
        return context.redis.pubClient.unlink(`room:${roomId}:queued_track:${id}`)
      }),
    )

    await deletes

    // Writes tracks to Redis that are in the Spotify queue
    const writes = Promise.all(
      items.map(async (item) => {
        const isInQueue = await context.redis.pubClient.sIsMember(
          `room:${roomId}:queue`,
          item.track.id,
        )
        if (isInQueue) {
          return item
        }

        await context.redis.pubClient.sAdd(`room:${roomId}:queue`, item.track.id)
        await context.redis.pubClient.set(
          `room:${roomId}:queued_track:${item.track.id}`,
          JSON.stringify(item),
        )
        return item
      }),
    )

    await writes
    return await getQueue({ roomId, context })
  } catch (e) {
    console.log("ERROR FROM data/djs/removeFromQueue", roomId, items)
    console.error(e)
    return []
  }
}

export async function clearQueue({ roomId, context }: { roomId: string; context: AppContext }) {
  try {
    await deleteMembersFromSet({
      context,
      setKey: `room:${roomId}:queue`,
      recordPrefix: `room:${roomId}:queued_track`,
    })
    await context.redis.pubClient.unlink(`room:${roomId}:queue`)
    return []
  } catch (e) {
    console.log("ERROR FROM data/djs/clearQueue", roomId)
    console.error(e)
    return []
  }
}
