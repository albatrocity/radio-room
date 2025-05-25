import { pubClient } from "../../lib/redisClients"
import { QueueItem } from "@repo/types/Queue"

export async function addTrackToRoomPlaylist(roomId: string, item: Partial<QueueItem>) {
  try {
    const trackString = JSON.stringify(item)
    const key = `room:${roomId}:playlist`
    const score = item.addedAt ?? Date.now()
    return pubClient.zAdd(key, [{ score, value: trackString }])
  } catch (e) {
    console.log("ERROR FROM data/playlists/addTrackToRoomPlaylist", roomId, item)
    console.error(e)
  }
}

export async function getRoomPlaylist(roomId: string, offset: number = 0, count: number = -1) {
  try {
    const roomKey = `room:${roomId}:playlist`
    const roomExists = await pubClient.exists(roomKey)
    if (!roomExists) {
      return []
    } else {
      const results = await pubClient.zRange(roomKey, offset, count)
      return results.map((m) => JSON.parse(m) as QueueItem) || []
    }
  } catch (e) {
    console.log("ERROR FROM data/playlists/getRoomPlaylist", roomId, offset, count)
    console.error(e)
    return []
  }
}

export async function getRoomPlaylistSince(roomId: string, since: number = Date.now()) {
  try {
    const roomKey = `room:${roomId}:playlist`
    const roomExists = await pubClient.exists(roomKey)
    if (!roomExists) {
      return []
    } else {
      const results = await pubClient.zRangeByScore(roomKey, since, "+inf")
      return results.map((m) => JSON.parse(m) as QueueItem) || []
    }
  } catch (e) {
    console.log("ERROR FROM data/playlists/getRoomPlaylist", roomId, since)
    console.error(e)
    return []
  }
}

export async function clearRoomPlaylist(roomId: string) {
  try {
    console.log("CLEARING Playlist", roomId)
    const roomKey = `room:${roomId}:playlist`
    return pubClient.unlink(roomKey)
  } catch (e) {
    console.log("ERROR FROM data/messages/clearMessages", roomId)
    console.error(e)
  }
}
