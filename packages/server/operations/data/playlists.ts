import { AppContext, QueueItem } from "@repo/types"

type AddTrackToRoomPlaylistParams = {
  context: AppContext
  roomId: string
  item: Partial<QueueItem>
}

export async function addTrackToRoomPlaylist({
  context,
  roomId,
  item,
}: AddTrackToRoomPlaylistParams) {
  try {
    const trackString = JSON.stringify(item)
    const key = `room:${roomId}:playlist`
    const score = item.addedAt ?? Date.now()
    return context.redis.pubClient.zAdd(key, [{ score, value: trackString }])
  } catch (e) {
    console.log("ERROR FROM data/playlists/addTrackToRoomPlaylist", roomId, item)
    console.error(e)
  }
}

type GetRoomPlaylistParams = {
  context: AppContext
  roomId: string
  offset?: number
  count?: number
}

export async function getRoomPlaylist({
  context,
  roomId,
  offset = 0,
  count = -1,
}: GetRoomPlaylistParams) {
  try {
    const roomKey = `room:${roomId}:playlist`
    const roomExists = await context.redis.pubClient.exists(roomKey)
    if (!roomExists) {
      return []
    } else {
      const results = await context.redis.pubClient.zRange(roomKey, offset, count)
      const items = results.map((m) => JSON.parse(m) as QueueItem) || []

      // Augment playlist items with plugin metadata
      if (context.pluginRegistry && items.length > 0) {
        return await context.pluginRegistry.augmentPlaylistItems(roomId, items)
      }

      return items
    }
  } catch (e) {
    console.log("ERROR FROM data/playlists/getRoomPlaylist", roomId, offset, count)
    console.error(e)
    return []
  }
}

type GetRoomPlaylistSinceParams = {
  context: AppContext
  roomId: string
  since?: number
}

export async function getRoomPlaylistSince({
  context,
  roomId,
  since = Date.now(),
}: GetRoomPlaylistSinceParams) {
  try {
    const roomKey = `room:${roomId}:playlist`
    const roomExists = await context.redis.pubClient.exists(roomKey)
    if (!roomExists) {
      return []
    } else {
      const results = await context.redis.pubClient.zRangeByScore(roomKey, since, "+inf")
      const items = results.map((m) => JSON.parse(m) as QueueItem) || []

      // Augment playlist items with plugin metadata
      if (context.pluginRegistry && items.length > 0) {
        return await context.pluginRegistry.augmentPlaylistItems(roomId, items)
      }

      return items
    }
  } catch (e) {
    console.log("ERROR FROM data/playlists/getRoomPlaylist", roomId, since)
    console.error(e)
    return []
  }
}

type ClearRoomPlaylistParams = {
  context: AppContext
  roomId: string
}

export async function clearRoomPlaylist({ context, roomId }: ClearRoomPlaylistParams) {
  try {
    console.log("CLEARING Playlist", roomId)
    const roomKey = `room:${roomId}:playlist`
    return context.redis.pubClient.unlink(roomKey)
  } catch (e) {
    console.log("ERROR FROM data/messages/clearMessages", roomId)
    console.error(e)
  }
}

type RemoveFromPlaylistParams = {
  context: AppContext
  roomId: string
  playedAt: number // Unique identifier for the track
}

/**
 * Remove a track from the playlist by its playedAt timestamp.
 * Returns true if the track was found and removed, false otherwise.
 */
export async function removeFromPlaylist({
  context,
  roomId,
  playedAt,
}: RemoveFromPlaylistParams): Promise<boolean> {
  try {
    const roomKey = `room:${roomId}:playlist`
    const roomExists = await context.redis.pubClient.exists(roomKey)
    if (!roomExists) {
      return false
    }

    // Get all items to find the one with matching playedAt
    const results = await context.redis.pubClient.zRange(roomKey, 0, -1)

    for (const itemString of results) {
      const item = JSON.parse(itemString) as QueueItem
      if (item.playedAt === playedAt) {
        // Remove this specific item by value
        const removed = await context.redis.pubClient.zRem(roomKey, itemString)
        return removed > 0
      }
    }

    return false
  } catch (e) {
    console.log("ERROR FROM data/playlists/removeFromPlaylist", roomId, playedAt)
    console.error(e)
    return false
  }
}
