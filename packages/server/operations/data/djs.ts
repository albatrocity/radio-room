import { pubClient } from "../../lib/redisClients"
import { QueueItem } from "@repo/types/Queue"
import { deleteMembersFromSet, getMembersFromSet } from "./utils"

export async function addDj(roomId: string, userId: string) {
  try {
    return pubClient.sAdd(`room:${roomId}:djs`, userId)
  } catch (e) {
    console.log("ERROR FROM data/djs/addDj", roomId, userId)
    console.error(e)
    return null
  }
}
export async function removeDj(roomId: string, userId: string) {
  try {
    if (userId) {
      return pubClient.sRem(`room:${roomId}:djs`, userId)
    }
    return null
  } catch (e) {
    console.log("ERROR FROM data/djs/removeDj", roomId, userId)
    console.error(e)
    return null
  }
}
export async function getDjs(roomId: string) {
  try {
    return pubClient.sMembers(`room:${roomId}:djs`)
  } catch (e) {
    console.log("ERROR FROM data/djs/getDjs", roomId)
    console.error(e)
    return []
  }
}
export async function isDj(roomId: string, userId: string) {
  try {
    return pubClient.sIsMember(`room:${roomId}:djs`, userId)
  } catch (e) {
    console.log("ERROR FROM data/djs/getDjs", roomId)
    console.error(e)
    return false
  }
}

export async function addToQueue(roomId: string, item: QueueItem) {
  try {
    const value = JSON.stringify(item)
    await pubClient.sAdd(`room:${roomId}:queue`, item.track.id)
    await pubClient.set(`room:${roomId}:queued_track:${item.track.id}`, value)
  } catch (e) {
    console.log("ERROR FROM data/djs/addToQueue", roomId, item)
    console.error(e)
    return null
  }
}

export async function removeFromQueue(roomId: string, trackId: QueueItem["track"]["id"]) {
  await pubClient.sRem(`room:${roomId}:queue`, trackId)
  await pubClient.unlink(`room:${roomId}:queued_track:${trackId}`)
  return null
}

export async function getQueue(roomId: string) {
  try {
    const results = await getMembersFromSet<QueueItem>(
      `room:${roomId}:queue`,
      `room:${roomId}:queued_track`,
    )
    return results
  } catch (e) {
    console.log("ERROR FROM data/djs/removeFromQueue", roomId)
    console.error(e)
    return []
  }
}

export async function setQueue(roomId: string, items: QueueItem[]) {
  try {
    const currentQueue = await pubClient.sMembers(`room:${roomId}:queue`)

    // Deletes tracks from Redis that are not in the Spotify queue
    const deletes = Promise.all(
      currentQueue.map(async (id) => {
        const isInQueue = items.some((item) => item.track.id === id)
        if (isInQueue) {
          return null
        }
        await pubClient.sRem(`room:${roomId}:queue`, id)
        return pubClient.unlink(`room:${roomId}:queued_track:${id}`)
      }),
    )

    await deletes

    // Writes tracks to Redis that are in the Spotify queue
    const writes = Promise.all(
      items.map(async (item) => {
        const isInQueue = await pubClient.sIsMember(`room:${roomId}:queue`, item.track.id)
        if (isInQueue) {
          return item
        }

        await pubClient.sAdd(`room:${roomId}:queue`, item.track.id)
        await pubClient.set(`room:${roomId}:queued_track:${item.track.id}`, JSON.stringify(item))
        return item
      }),
    )

    await writes
    return await getQueue(roomId)
  } catch (e) {
    console.log("ERROR FROM data/djs/removeFromQueue", roomId, items)
    console.error(e)
    return []
  }
}

export async function clearQueue(roomId: string) {
  try {
    await deleteMembersFromSet(`room:${roomId}:queue`, `room:${roomId}:queued_track`)
    await pubClient.unlink(`room:${roomId}:queue`)
    return []
  } catch (e) {
    console.log("ERROR FROM data/djs/clearQueue", roomId)
    console.error(e)
    return []
  }
}
